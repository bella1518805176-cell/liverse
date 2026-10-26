import { Inject, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { Database } from "./db";
import { AuthService } from "./auth";
import { Storage } from "./storage";
import { fail } from "./errors";
import { MAX_ORIGINAL_BYTES } from "../../../packages/contracts";
@Injectable()
export class MediaService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(AuthService) private auth: AuthService,
    @Inject(Storage) private storage: Storage,
  ) {}
  async create(req: Request, admin = false) {
    const u = admin
      ? await this.auth.officialUser(req)
      : await this.auth.user(req);
    return this.db.media.create({
      data: { userId: u.id, objectKey: `original/${randomUUID()}.bin` },
      select: { id: true, state: true },
    });
  }
  async upload(
    req: Request,
    id: string,
    file?: Express.Multer.File,
    admin = false,
  ) {
    const u = admin
      ? await this.auth.officialUser(req)
      : await this.auth.user(req);
    if (!file || file.size > MAX_ORIGINAL_BYTES)
      fail(400, "INVALID_UPLOAD", "请选择不超过 20 MB 的图片");
    return this.db.$transaction(
      async (tx) => {
        // Serialize storage writes and job creation, including retries from other API instances.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`upload:${id}`}, 0))`;
        const media = await tx.media.findFirst({ where: { id, userId: u.id } });
        if (!media) fail(400, "INVALID_UPLOAD", "图片上传记录不存在");
        if (media.state !== "created") return { id, state: media.state };
        await this.storage.put(media.objectKey, file.buffer);
        await tx.media.update({
          where: { id },
          data: { state: "processing" },
        });
        await tx.job.create({ data: { kind: "process-image", targetId: id } });
        return { id, state: "processing" };
      },
      { timeout: 60000 },
    );
  }
  async status(req: Request, id: string) {
    const u = await this.auth.user(req);
    const media = await this.db.media.findFirst({
      where: { id, userId: u.id },
      select: { id: true, state: true },
    });
    if (!media) fail(404, "NOT_FOUND", "图片不存在");
    return media;
  }
  async serve(req: Request, res: Response, id: string, admin = false) {
    const media = await this.db.media.findUnique({
      where: { id },
      include: { contribution: { include: { layout: true } } },
    });
    if (!media || media.state !== "ready" || !media.derivedKey)
      fail(410, "MEDIA_UNAVAILABLE", "图片不可用");
    const c = media.contribution;
    if (!c || c.state !== "published" || c.layout.status !== "published") {
      if (admin) {
        await this.auth.admin(req);
        if (c?.state === "deleted")
          fail(410, "MEDIA_UNAVAILABLE", "图片已删除");
      } else {
        const u = await this.auth.user(req);
        if (u.id !== media.userId || c?.state === "deleted")
          fail(404, "NOT_FOUND", "图片不可用");
      }
    }
    const buffer = await this.storage.get(media.derivedKey);
    // Recheck after I/O so a concurrent withdrawal cannot pass an earlier authorization check.
    const latest = await this.db.media.findUnique({
      where: { id },
      include: { contribution: { include: { layout: true } } },
    });
    if (
      !latest ||
      latest.state !== "ready" ||
      latest.contribution?.state === "deleted" ||
      (!admin &&
        c?.state === "published" &&
        (latest.contribution?.state !== "published" ||
          latest.contribution.layout.status !== "published"))
    )
      fail(410, "MEDIA_UNAVAILABLE", "图片已下架");
    res.setHeader("Cache-Control", "private, no-store");
    res.type("image/webp").send(buffer);
  }
}
