import "reflect-metadata";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import supertest from "supertest";
import argon2 from "argon2";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../apps/api/src/app";
import { runJob, processImage } from "../apps/api/src/worker";
import { demoLayout } from "../fixtures/beijing-demo";
import type { ContributionInput } from "../packages/contracts";
const postgres = new EmbeddedPostgres({
  databaseDir: path.resolve(`.local/test-${randomUUID()}`),
  user: "liverse",
  password: "test_password",
  port: 55433,
  persistent: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: () => {},
});
let app: INestApplication,
  db: PrismaClient,
  access = "",
  other = "",
  contentId = "",
  mediaId = "",
  csrf = "",
  cookie = "",
  layoutCookie = "",
  layoutCsrf = "";
const layout = demoLayout(),
  position = {
    venueId: "beijing",
    layoutVersionId: layout.id,
    kind: "seat" as const,
    seatId: layout.seats[0].id,
  };
const input: ContributionInput = {
  position,
  text: "接口测试内容",
  tags: ["现场氛围"],
  mediaIds: [],
  consent: true,
  displayName: "测试观众",
};
const req = () => supertest(app.getHttpServer());
const adminReq = (method: "post" | "get", route: string) =>
  req()
    [method](route)
    .set("Cookie", cookie)
    .set("Origin", "http://127.0.0.1:5173")
    .set("X-CSRF-Token", csrf);
const dataAdminReq = (route: string) =>
  req()
    .post(route)
    .set("Cookie", layoutCookie)
    .set("Origin", "http://127.0.0.1:5173")
    .set("X-CSRF-Token", layoutCsrf);
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.ENABLE_DEV_LOGIN = "true";
  process.env.APP_ORIGIN = "http://127.0.0.1:5173";
  process.env.DATABASE_URL =
    "postgresql://liverse:test_password@127.0.0.1:55433/liverse_test?schema=public";
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("liverse_test");
  const client = postgres.getPgClient("liverse_test");
  await client.connect();
  await client.query(
    await readFile(
      "apps/api/prisma/migrations/202610260001_initial/migration.sql",
      "utf8",
    ),
  );
  await client.end();
  db = new PrismaClient();
  await db.venue.create({
    data: { id: "beijing", name: "北京 LIVERSE", currentLayoutId: layout.id },
  });
  await db.layoutVersion.create({
    data: {
      id: layout.id,
      venueId: "beijing",
      status: "published",
      data: JSON.parse(JSON.stringify(layout)),
    },
  });
  const hash = await argon2.hash("test_password_long");
  await db.admin.createMany({
    data: [
      { username: "content", passwordHash: hash, role: "content" },
      { username: "layout", passwordHash: hash, role: "layout" },
    ],
  });
  app = await createApp();
  await app.init();
  access = (
    await req()
      .post("/api/v1/auth/wechat")
      .send({ devIdentity: "alice" })
      .expect(201)
  ).body.accessToken;
  other = (
    await req()
      .post("/api/v1/auth/wechat")
      .send({ devIdentity: "bob" })
      .expect(201)
  ).body.accessToken;
  const admin = await req()
    .post("/api/v1/admin/login")
    .send({ username: "content", password: "test_password_long" })
    .expect(201);
  csrf = admin.body.csrf;
  cookie = admin.headers["set-cookie"][0].split(";")[0];
  const a = await req()
    .post("/api/v1/admin/login")
    .send({ username: "layout", password: "test_password_long" })
    .expect(201);
  layoutCsrf = a.body.csrf;
  layoutCookie = a.headers["set-cookie"][0].split(";")[0];
}, 60000);
afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
  await postgres.stop();
}, 30000);
describe.sequential("persistent API permissions and lifecycle", () => {
  it("authenticates uploads before parsing multipart bodies", async () => {
    await req()
      .post("/api/v1/uploads/unknown/file")
      .set("Content-Type", "multipart/form-data")
      .send("malformed")
      .expect(401);
    await req()
      .post("/api/v1/admin/uploads/unknown/file")
      .set("Content-Type", "multipart/form-data")
      .send("malformed")
      .expect(401);
    await dataAdminReq("/api/v1/admin/uploads/unknown/file")
      .set("Content-Type", "multipart/form-data")
      .send("malformed")
      .expect(403);
  });
  it("serializes duplicate uploads without overwriting processed originals", async () => {
    const image = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#239055" },
    })
      .png()
      .toBuffer();
    const id = (
      await req()
        .post("/api/v1/uploads")
        .set("Authorization", `Bearer ${access}`)
        .expect(201)
    ).body.id;
    const send = (bytes: Buffer) =>
      req()
        .post(`/api/v1/uploads/${id}/file`)
        .set("Authorization", `Bearer ${access}`)
        .attach("file", bytes, "image.png")
        .expect(201);
    await Promise.all([send(image), send(image)]);
    const stored = await db.media.findUniqueOrThrow({ where: { id } });
    const original = await readFile(
      path.resolve(".local/media", stored.objectKey),
    );
    await send(Buffer.from("late overwrite"));
    expect(
      await readFile(path.resolve(".local/media", stored.objectKey)),
    ).toEqual(original);
    expect(await db.job.count({ where: { targetId: id } })).toBe(1);
    await runJob(db);
    expect((await db.media.findUniqueOrThrow({ where: { id } })).state).toBe(
      "ready",
    );
  });
  it("sends official photos for review, enforces roles and filters seat content by section", async () => {
    await req().post("/api/v1/admin/uploads").expect(401);
    await dataAdminReq("/api/v1/admin/uploads").expect(403);
    const id = (await adminReq("post", "/api/v1/admin/uploads").expect(201))
      .body.id;
    const bytes = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#542399" },
    })
      .png()
      .toBuffer();
    await req()
      .post(`/api/v1/uploads/${id}/file`)
      .set("Authorization", `Bearer ${access}`)
      .attach("file", bytes, "test.png")
      .expect(400);
    await adminReq("post", `/api/v1/admin/uploads/${id}/file`)
      .attach("file", bytes, "official.png")
      .expect(201);
    await runJob(db);
    expect(
      (await adminReq("get", `/api/v1/admin/uploads/${id}`).expect(200)).body
        .state,
    ).toBe("ready");
    const official = { ...input, mediaIds: [id] };
    await dataAdminReq("/api/v1/admin/official-content")
      .set("Idempotency-Key", "official_001")
      .send(official)
      .expect(403);
    const created = (
      await adminReq("post", "/api/v1/admin/official-content")
        .set("Idempotency-Key", "official_001")
        .send(official)
        .expect(201)
    ).body;
    expect(
      (
        await adminReq("post", "/api/v1/admin/official-content")
          .set("Idempotency-Key", "official_001")
          .send(official)
          .expect(201)
      ).body.id,
    ).toBe(created.id);
    await req().get(`/api/v1/contributions/${created.id}`).expect(410);
    await adminReq("post", `/api/v1/admin/contributions/${created.id}/review`)
      .send({ state: "published", revision: 0 })
      .expect(201);
    expect(
      (await req().get(`/api/v1/contributions/${created.id}`).expect(200)).body
        .source,
    ).toBe("official");
    const route = `/api/v1/contributions?venueId=beijing&kind=photo&sectionId=`;
    expect(
      (
        await req()
          .get(route + encodeURIComponent(layout.seats[0].sectionId))
          .expect(200)
      ).body.items.map((v: { id: string }) => v.id),
    ).toContain(created.id);
    expect(
      (
        await req()
          .get(route + "missing")
          .expect(200)
      ).body.items,
    ).toEqual([]);
    expect(
      await db.auditLog.count({
        where: { action: "official.create", targetId: created.id },
      }),
    ).toBe(1);
    await adminReq("post", `/api/v1/admin/contributions/${created.id}/review`)
      .send({ state: "withdrawn", revision: 1, reason: "测试结束" })
      .expect(201);
    await req().get(`/api/v1/media/${id}`).expect(401);
  });
  it("resolves matching published positions without requiring events", async () => {
    expect(
      (await req().get("/api/v1/venues").expect(200)).body[0].layout.id,
    ).toBe(layout.id);
    await req().post("/api/v1/positions/resolve").send(position).expect(201);
    await req()
      .post("/api/v1/positions/resolve")
      .send({ ...position, seatId: "fabricated" })
      .expect(400);
    expect((await req().get("/api/v1/events").expect(200)).body).toEqual([]);
  });
  it("creates favorites idempotently and isolates accounts", async () => {
    for (let i = 0; i < 2; i++)
      await req()
        .put("/api/v1/me/favorites")
        .set("Authorization", `Bearer ${access}`)
        .send({ position, enabled: true })
        .expect(200);
    expect(
      (
        await req()
          .get("/api/v1/me/favorites")
          .set("Authorization", `Bearer ${access}`)
      ).body,
    ).toHaveLength(1);
    expect(
      (
        await req()
          .get("/api/v1/me/favorites")
          .set("Authorization", `Bearer ${other}`)
      ).body,
    ).toEqual([]);
    await req().get("/api/v1/me/favorites").expect(401);
  });
  it("processes actual image bytes, strips metadata, checks ownership", async () => {
    const original = await sharp({
      create: { width: 100, height: 80, channels: 3, background: "#ff5018" },
    })
      .withMetadata({ exif: { IFD0: { Copyright: "test" } } })
      .jpeg()
      .toBuffer();
    const meta = await sharp(await processImage(original)).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe("webp");
    await expect(processImage(Buffer.from("not an image"))).rejects.toThrow();
    mediaId = (
      await req()
        .post("/api/v1/uploads")
        .set("Authorization", `Bearer ${access}`)
        .expect(201)
    ).body.id;
    await req()
      .post(`/api/v1/uploads/${mediaId}/file`)
      .set("Authorization", `Bearer ${other}`)
      .attach("file", original, "test.jpg")
      .expect(400);
    await req()
      .post(`/api/v1/uploads/${mediaId}/file`)
      .set("Authorization", `Bearer ${access}`)
      .attach("file", original, "test.jpg")
      .expect(201);
    await runJob(db);
    expect(
      (
        await req()
          .get(`/api/v1/uploads/${mediaId}`)
          .set("Authorization", `Bearer ${access}`)
          .expect(200)
      ).body.state,
    ).toBe("ready");
  });
  it("keeps pending submissions private and retries once", async () => {
    input.mediaIds = [mediaId];
    const a = await req()
      .post("/api/v1/me/contributions")
      .set("Authorization", `Bearer ${access}`)
      .set("Idempotency-Key", "contribution_001")
      .send(input)
      .expect(201);
    contentId = a.body.id;
    const b = await req()
      .post("/api/v1/me/contributions")
      .set("Authorization", `Bearer ${access}`)
      .set("Idempotency-Key", "contribution_001")
      .send(input)
      .expect(201);
    expect(b.body.id).toBe(contentId);
    await req()
      .post("/api/v1/me/contributions")
      .set("Authorization", `Bearer ${access}`)
      .set("Idempotency-Key", "contribution_001")
      .send({ ...input, text: "different" })
      .expect(409);
    await req().get(`/api/v1/contributions/${contentId}`).expect(410);
    await req().get(`/api/v1/media/${mediaId}`).expect(401);
    expect(
      (
        await req()
          .get("/api/v1/me/contributions")
          .set("Authorization", `Bearer ${other}`)
      ).body,
    ).toEqual([]);
  });
  it("enforces admin roles, origin/CSRF and review revisions", async () => {
    await req()
      .post(`/api/v1/admin/contributions/${contentId}/review`)
      .set("Cookie", cookie)
      .send({ state: "published", revision: 0 })
      .expect(403);
    await dataAdminReq(`/api/v1/admin/contributions/${contentId}/review`)
      .send({ state: "published", revision: 0 })
      .expect(403);
    await adminReq("post", `/api/v1/admin/contributions/${contentId}/review`)
      .send({ state: "published", revision: 0 })
      .expect(201);
    await adminReq("post", `/api/v1/admin/contributions/${contentId}/review`)
      .send({ state: "rejected", revision: 0, reason: "stale" })
      .expect(409);
    const publicRow = (
      await req().get(`/api/v1/contributions/${contentId}`).expect(200)
    ).body;
    expect(publicRow.userId).toBeUndefined();
    expect(publicRow.wechatKey).toBeUndefined();
    expect(publicRow.mediaIds).toEqual([mediaId]);
    await req()
      .get(`/api/v1/media/${mediaId}`)
      .expect(200)
      .expect("Cache-Control", "private, no-store");
  });
  it("makes helpful explicit and tracks private tickets and replies", async () => {
    for (let i = 0; i < 2; i++)
      await req()
        .put(`/api/v1/contributions/${contentId}/helpful`)
        .set("Authorization", `Bearer ${other}`)
        .send({ enabled: true })
        .expect(200);
    expect(
      (await req().get(`/api/v1/contributions/${contentId}`)).body.helpfulCount,
    ).toBe(1);
    const ticket = (
      await req()
        .post("/api/v1/me/tickets")
        .set("Authorization", `Bearer ${other}`)
        .set("Idempotency-Key", "ticket_0001")
        .send({
          category: "privacy",
          text: "请检查此照片的隐私内容",
          targetId: contentId,
        })
        .expect(201)
    ).body;
    expect(
      (
        await req()
          .get("/api/v1/me/tickets")
          .set("Authorization", `Bearer ${access}`)
      ).body,
    ).toEqual([]);
    await adminReq("post", `/api/v1/admin/tickets/${ticket.id}/reply`)
      .send({ status: "resolved", reply: "已处理", revision: 0 })
      .expect(201);
    expect(
      (
        await req()
          .get("/api/v1/me/tickets")
          .set("Authorization", `Bearer ${other}`)
      ).body[0].reply,
    ).toBe("已处理");
  });
  it("deletes content, blocks stale reviews and every media route", async () => {
    await req()
      .delete(`/api/v1/me/contributions/${contentId}`)
      .set("Authorization", `Bearer ${other}`)
      .expect(404);
    await req()
      .delete(`/api/v1/me/contributions/${contentId}`)
      .set("Authorization", `Bearer ${access}`)
      .expect(200);
    await req().get(`/api/v1/contributions/${contentId}`).expect(410);
    await req().get(`/api/v1/media/${mediaId}`).expect(401);
    await req()
      .get(`/api/v1/media/${mediaId}`)
      .set("Authorization", `Bearer ${access}`)
      .expect(404);
    await adminReq("get", `/api/v1/admin/media/${mediaId}`).expect(410);
    await adminReq("post", `/api/v1/admin/contributions/${contentId}/review`)
      .send({ state: "published", revision: 1 })
      .expect(409);
    await runJob(db);
  });
  it("publishes immutable versions with audit and rejects production examples", async () => {
    const next = { ...layout, id: "demo-v2", status: "draft" };
    const route = "/api/v1/admin/layouts";
    await dataAdminReq(route).send(next).expect(201);
    await dataAdminReq(`${route}/demo-v2/publish`)
      .send({ action: "publish", revision: 0 })
      .expect(201);
    await dataAdminReq(route).send(next).expect(409);
    await dataAdminReq(`${route}/demo-v2/publish`)
      .send({ action: "withdraw", revision: 1 })
      .expect(201);
    await req().get("/api/v1/layouts/demo-v2").expect(410);
    expect(await db.auditLog.count()).toBeGreaterThan(2);
    process.env.NODE_ENV = "production";
    await req()
      .post("/api/v1/auth/wechat")
      .send({ devIdentity: "intruder" })
      .expect(400);
    process.env.NODE_ENV = "test";
  });
  it("rotates refresh tokens and revokes a reused family", async () => {
    const first = (
      await req().post("/api/v1/auth/wechat").send({ devIdentity: "rotation" })
    ).body;
    const next = (
      await req()
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: first.refreshToken })
        .expect(201)
    ).body;
    await req()
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${first.accessToken}`)
      .expect(401);
    await req()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    await req()
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${next.accessToken}`)
      .expect(401);
  });
});
