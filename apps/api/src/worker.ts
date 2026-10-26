import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { Storage } from "./storage";
import {
  MAX_IMAGE_PIXELS,
  MAX_ORIGINAL_BYTES,
} from "../../../packages/contracts";
import { assertEnvironment } from "./config";
export async function processImage(buffer: Buffer): Promise<Buffer> {
  if (buffer.length > MAX_ORIGINAL_BYTES) throw new Error("Image too large");
  const image = sharp(buffer, {
    limitInputPixels: MAX_IMAGE_PIXELS,
    failOn: "error",
  });
  const metadata = await image.metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error("Unsupported image format");
  const result = await image
    .rotate()
    .resize({
      width: 2200,
      height: 2200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  if (result.length > 5 * 1024 * 1024)
    throw new Error("Processed image too large");
  return result;
}
export async function runJob(db: PrismaClient, storage = new Storage()) {
  const leaseToken = randomUUID();
  const jobs = await db.$queryRaw<
    Array<{ id: string; kind: string; targetId: string; attempts: number }>
  >`
    UPDATE "Job" SET state = 'running', "leaseUntil" = NOW() + interval '90 seconds', "leaseToken" = ${leaseToken}, attempts = attempts + 1
    WHERE id = (SELECT id FROM "Job" WHERE (state = 'queued' AND "availableAt" <= NOW()) OR (state = 'running' AND "leaseUntil" < NOW()) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, kind, "targetId", attempts`;
  const job = jobs[0];
  if (!job) return false;
  const heartbeat = setInterval(() => {
    void db.job
      .updateMany({
        where: { id: job.id, leaseToken, state: "running" },
        data: { leaseUntil: new Date(Date.now() + 90000) },
      })
      .catch(() => undefined);
  }, 20000);
  try {
    if (job.kind === "process-image") {
      const media = await db.media.findUnique({ where: { id: job.targetId } });
      if (media && media.state === "processing") {
        const buffer = await processImage(await storage.get(media.objectKey));
        const key = `derived/${media.id}.webp`;
        await storage.put(key, buffer);
        await db.media.updateMany({
          where: { id: media.id, state: "processing" },
          data: { state: "ready", derivedKey: key },
        });
      }
    } else if (job.kind === "delete-media") {
      for (const media of await db.media.findMany({
        where: { contributionId: job.targetId },
      })) {
        await db.media.update({
          where: { id: media.id },
          data: { state: "deleted" },
        });
        await storage.remove(media.objectKey);
        if (media.derivedKey) await storage.remove(media.derivedKey);
      }
    } else if (job.kind === "cleanup") {
      for (const media of await db.media.findMany({
        where: {
          contributionId: null,
          createdAt: { lt: new Date(Date.now() - 86400000) },
        },
      })) {
        await storage.remove(media.objectKey);
        if (media.derivedKey) await storage.remove(media.derivedKey);
        await db.media.delete({ where: { id: media.id } });
      }
    } else throw new Error("Unknown job kind");
    await db.job.updateMany({
      where: { id: job.id, leaseToken },
      data: { state: "done", leaseUntil: null, leaseToken: null },
    });
  } catch {
    const failed = job.attempts >= 4;
    await db.job.updateMany({
      where: { id: job.id, leaseToken },
      data: {
        state: failed ? "failed" : "queued",
        availableAt: new Date(Date.now() + 1000 * 2 ** job.attempts),
        error: "PROCESSING_FAILED",
        leaseUntil: null,
        leaseToken: null,
      },
    });
    if (failed && job.kind === "process-image")
      await db.media.updateMany({
        where: { id: job.targetId, state: "processing" },
        data: { state: "failed" },
      });
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
export async function startWorker(db = new PrismaClient()) {
  assertEnvironment();
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  let lastCleanup = 0;
  while (!stopping) {
    if (Date.now() - lastCleanup > 3600000) {
      await db.job.create({
        data: { kind: "cleanup", targetId: "orphan-media" },
      });
      lastCleanup = Date.now();
    }
    if (!(await runJob(db)))
      await new Promise((resolve) => setTimeout(resolve, 800));
  }
  await db.$disconnect();
}
if (process.argv[1] && /[\\/]worker\.(ts|js)$/.test(process.argv[1]))
  void startWorker();
