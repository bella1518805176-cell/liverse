import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import {
  type ContributionInput,
  type Layout,
  type PositionRef,
  validatePosition,
  validateContribution,
  positionKey,
} from "../../../packages/contracts";
import { resolvePosition, validateLayout } from "../../../packages/venue-core";
import { AuthService, digest } from "./auth";
import { Database } from "./db";
import { fail } from "./errors";
import { production } from "./config";
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const contentSelect = {
  id: true,
  position: true,
  eventId: true,
  text: true,
  tags: true,
  displayName: true,
  source: true,
  state: true,
  createdAt: true,
  device: true,
  zoom: true,
  shotDate: true,
  revision: true,
  media: { select: { id: true }, where: { state: "ready" } },
  _count: { select: { helpful: true } },
} satisfies Prisma.ContributionSelect;
@Injectable()
export class AppService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(AuthService) readonly auth: AuthService,
  ) {}
  async layout(id: string, allowDraft = false) {
    const record = await this.db.layoutVersion.findUnique({ where: { id } });
    if (!record || (!allowDraft && record.status !== "published"))
      fail(410, "LAYOUT_UNAVAILABLE", "布局尚未发布或已下架，请重新选择");
    const layout = record.data as unknown as Layout;
    if (production() && layout.demo)
      fail(410, "LAYOUT_UNAVAILABLE", "资料准备中");
    return { ...layout, status: record.status, revision: record.revision };
  }
  async position(raw: unknown) {
    if (!validatePosition(raw)) fail(400, "INVALID_POSITION", "位置参数无效");
    const layout = await this.layout(raw.layoutVersionId);
    try {
      resolvePosition(layout as Layout, raw);
    } catch {
      fail(400, "POSITION_NOT_FOUND", "位置不属于指定布局");
    }
    return raw;
  }
  async venues() {
    const venues = await this.db.venue.findMany({ orderBy: { id: "asc" } });
    return Promise.all(
      venues.map(async (v) => ({
        ...v,
        layout: v.currentLayoutId
          ? await this.layout(v.currentLayoutId).catch(() => null)
          : null,
      })),
    );
  }
  async listContent(query: Record<string, string | undefined>) {
    const where: Prisma.ContributionWhereInput = {
      state: "published",
      layout: { status: "published" },
    };
    if (production())
      where.layout = {
        status: "published",
        data: { path: ["demo"], equals: false },
      };
    if (query.venueId) where.venueId = query.venueId;
    if (query.eventId) where.eventId = query.eventId;
    if (query.sectionId) {
      const versions = await this.db.layoutVersion.findMany({
        where: {
          status: "published",
          ...(query.venueId ? { venueId: query.venueId } : {}),
        },
      });
      where.OR = [
        { position: { path: ["sectionId"], equals: query.sectionId } },
        ...versions.flatMap((v) =>
          (v.data as unknown as Layout).seats
            .filter((s) => s.sectionId === query.sectionId)
            .map((s) => ({
              layoutId: v.id,
              position: { path: ["seatId"], equals: s.id },
            })),
        ),
      ];
    }
    if (query.tag) where.tags = { has: query.tag };
    if (query.kind === "text") where.media = { none: {} };
    if (query.kind === "photo") where.media = { some: { state: "ready" } };
    const take = 12;
    let cursor: { id: string } | undefined;
    if (query.cursor) {
      const anchor = await this.db.contribution.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true },
      });
      if (!anchor) fail(400, "INVALID_CURSOR", "分页位置无效，请刷新列表");
      cursor = anchor;
    }
    const rows = await this.db.contribution.findMany({
      where,
      select: contentSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });
    const more = rows.length > take;
    if (more) rows.pop();
    return {
      items: rows.map((r) => {
        const { media, _count, ...rest } = r;
        return {
          ...rest,
          mediaIds: media.map((m) => m.id),
          helpfulCount: _count.helpful,
        };
      }),
      nextCursor: more ? rows.at(-1)!.id : null,
    };
  }
  async publicContent(id: string) {
    const c = await this.db.contribution.findFirst({
      where: { id, state: "published", layout: { status: "published" } },
      select: contentSelect,
    });
    if (!c) fail(410, "CONTENT_UNAVAILABLE", "内容已删除、下架或尚未公开");
    await this.layout((c.position as unknown as PositionRef).layoutVersionId);
    const { media, _count, ...rest } = c;
    return {
      ...rest,
      mediaIds: media.map((m) => m.id),
      helpfulCount: _count.helpful,
    };
  }
  async idempotent<T>(
    req: Request,
    userId: string,
    operation: string,
    body: unknown,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(key))
      fail(400, "IDEMPOTENCY_REQUIRED", "缺少有效的提交标识");
    const requestHash = digest(JSON.stringify(body));
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${operation}:${key}`}, 0))`;
      const prior = await tx.idempotency.findUnique({
        where: { actorId_operation_key: { actorId: userId, operation, key } },
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          fail(409, "IDEMPOTENCY_CONFLICT", "该提交标识已用于其他内容");
        return prior.response as T;
      }
      const response = await work(tx);
      await tx.idempotency.create({
        data: {
          actorId: userId,
          operation,
          key,
          requestHash,
          response: json(response),
        },
      });
      return response;
    });
  }
  async contribute(req: Request, body: unknown, official = false) {
    const user = official
      ? await this.auth.officialUser(req)
      : await this.auth.user(req);
    if (!validateContribution(body))
      fail(400, "INVALID_CONTRIBUTION", "请检查投稿内容、图片数量和公开授权");
    const input = body as ContributionInput;
    await this.position(input.position);
    if (
      input.eventId &&
      !(await this.db.event.findFirst({
        where: { id: input.eventId, venueId: input.position.venueId },
      }))
    )
      fail(400, "EVENT_MISMATCH", "场次不属于当前场馆");
    return this.idempotent(req, user.id, "contribute", body, async (tx) => {
      const media = await tx.media.findMany({
        where: {
          id: { in: input.mediaIds },
          userId: user.id,
          state: "ready",
          contributionId: null,
        },
      });
      if (media.length !== input.mediaIds.length)
        fail(409, "MEDIA_NOT_READY", "图片尚未处理完成或不可使用");
      const c = await tx.contribution.create({
        data: {
          userId: user.id,
          venueId: input.position.venueId,
          layoutId: input.position.layoutVersionId,
          position: json(input.position),
          text: input.text.trim(),
          tags: input.tags,
          displayName: input.displayName.trim(),
          eventId: input.eventId || null,
          device: input.device,
          zoom: input.zoom,
          shotDate: input.shotDate,
          consentAt: new Date(),
          source: official ? "official" : "user",
        },
      });
      const linked = await tx.media.updateMany({
        where: {
          id: { in: input.mediaIds },
          userId: user.id,
          state: "ready",
          contributionId: null,
        },
        data: { contributionId: c.id },
      });
      if (linked.count !== input.mediaIds.length)
        fail(409, "MEDIA_CONFLICT", "图片已关联其他投稿");
      if (official) {
        const admin = await this.auth.admin(req, "content");
        await tx.auditLog.create({
          data: {
            actorId: admin.id,
            action: "official.create",
            targetId: c.id,
            summary: { state: "pending" },
          },
        });
      }
      return { id: c.id, state: c.state };
    });
  }
  async favorites(req: Request) {
    const u = await this.auth.user(req);
    return this.db.favorite.findMany({
      where: { userId: u.id },
      select: { id: true, position: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }
  async setFavorite(req: Request, raw: unknown, enabled: boolean) {
    const u = await this.auth.user(req);
    if (!validatePosition(raw)) fail(400, "INVALID_POSITION", "位置无效");
    const key = positionKey(raw);
    if (!enabled) {
      await this.db.favorite.deleteMany({ where: { userId: u.id, key } });
      return { enabled: false };
    }
    await this.position(raw);
    await this.db.favorite.upsert({
      where: { userId_key: { userId: u.id, key } },
      create: {
        userId: u.id,
        layoutId: raw.layoutVersionId,
        key,
        position: json(raw),
      },
      update: {},
    });
    return { enabled: true };
  }
  async helpful(req: Request, id: string, enabled: boolean) {
    const u = await this.auth.user(req);
    await this.publicContent(id);
    if (enabled)
      await this.db.helpful.upsert({
        where: { userId_contributionId: { userId: u.id, contributionId: id } },
        create: { userId: u.id, contributionId: id },
        update: {},
      });
    else
      await this.db.helpful.deleteMany({
        where: { userId: u.id, contributionId: id },
      });
    return { enabled };
  }
  async deleteContribution(req: Request, id: string) {
    const u = await this.auth.user(req);
    await this.db.$transaction(async (tx) => {
      const c = await tx.contribution.findFirst({
        where: { id, userId: u.id },
      });
      if (!c) fail(404, "NOT_FOUND", "投稿不存在");
      if (c.state === "deleted") return;
      await tx.contribution.update({
        where: { id },
        data: { state: "deleted", revision: { increment: 1 } },
      });
      await tx.job.create({ data: { kind: "delete-media", targetId: id } });
    });
    return { ok: true };
  }
  async createTicket(
    req: Request,
    body: { category?: unknown; text?: unknown; targetId?: unknown },
  ) {
    const u = await this.auth.user(req);
    if (
      typeof body.text !== "string" ||
      body.text.trim().length < 2 ||
      body.text.length > 1000 ||
      ![
        "position",
        "content",
        "privacy",
        "copyright",
        "feedback",
        "account-deletion",
      ].includes(String(body.category))
    )
      fail(400, "INVALID_TICKET", "请填写有效的问题类型和描述");
    if (body.targetId !== undefined && typeof body.targetId !== "string")
      fail(400, "INVALID_TARGET", "举报目标无效");
    if (body.targetId) await this.publicContent(body.targetId as string);
    return this.idempotent(req, u.id, "ticket", body, async (tx) => {
      const t = await tx.ticket.create({
        data: {
          userId: u.id,
          category: String(body.category),
          text: String(body.text).trim(),
          targetId: body.targetId as string | undefined,
        },
      });
      return { id: t.id, status: t.status };
    });
  }
  async review(
    req: Request,
    id: string,
    body: { state?: string; revision?: number; reason?: string },
  ) {
    const admin = await this.auth.admin(req, "content");
    if (
      !["published", "rejected", "withdrawn"].includes(body.state ?? "") ||
      !Number.isInteger(body.revision) ||
      (body.state !== "published" && !body.reason?.trim())
    )
      fail(400, "INVALID_REVIEW", "请填写处理结果和说明");
    return this.db.$transaction(async (tx) => {
      const c = await tx.contribution.findUnique({
        where: { id },
        include: { media: true },
      });
      if (!c) fail(404, "NOT_FOUND", "投稿不存在");
      if (
        (body.state === "withdrawn" && c.state !== "published") ||
        (body.state !== "withdrawn" && c.state !== "pending") ||
        c.revision !== body.revision
      )
        fail(409, "STALE_REVIEW", "内容状态已变更，请刷新");
      if (body.state === "published") {
        await this.layout(c.layoutId);
        if (c.media.some((m) => m.state !== "ready"))
          fail(409, "MEDIA_NOT_READY", "图片尚未处理完成");
      }
      const updated = await tx.contribution.updateMany({
        where: { id, revision: body.revision, state: c.state },
        data: {
          state: body.state,
          reason: body.reason?.slice(0, 500) ?? "",
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) fail(409, "STALE_REVIEW", "内容状态已变更");
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: `content.${body.state}`,
          targetId: id,
          summary: { revision: body.revision! },
        },
      });
      return { ok: true };
    });
  }
  async saveLayout(req: Request, data: Layout) {
    const admin = await this.auth.admin(req, "layout");
    let errors: string[];
    try {
      errors = validateLayout(data, production());
    } catch {
      fail(400, "INVALID_LAYOUT", "布局数据结构无效");
    }
    if (errors.length) fail(400, "INVALID_LAYOUT", errors.join("；"));
    return this.db.$transaction(async (tx) => {
      const prior = await tx.layoutVersion.findUnique({
        where: { id: data.id },
      });
      if (prior && prior.status !== "draft")
        fail(409, "IMMUTABLE_LAYOUT", "已发布布局不可覆盖，请创建新版本");
      const saved = await tx.layoutVersion.upsert({
        where: { id: data.id },
        create: {
          id: data.id,
          venueId: data.venueId,
          data: json({ ...data, status: "draft" }),
        },
        update: {
          data: json({ ...data, status: "draft" }),
          revision: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "layout.save",
          targetId: data.id,
          summary: { revision: saved.revision },
        },
      });
      return saved;
    });
  }
  async publishLayout(
    req: Request,
    id: string,
    body: { action?: string; revision?: number },
  ) {
    const admin = await this.auth.admin(req, "layout");
    if (
      !["publish", "withdraw", "rollback"].includes(body.action ?? "") ||
      !Number.isInteger(body.revision)
    )
      fail(400, "INVALID_ACTION", "发布操作无效");
    return this.db.$transaction(async (tx) => {
      const record = await tx.layoutVersion.findUnique({ where: { id } });
      if (!record || record.revision !== body.revision)
        fail(409, "STALE_LAYOUT", "布局已更新，请刷新");
      const data = record.data as unknown as Layout;
      const errors = validateLayout(data, production());
      if (errors.length) fail(400, "INVALID_LAYOUT", errors.join("；"));
      if (body.action === "publish" && record.status !== "draft")
        fail(409, "INVALID_TRANSITION", "请发布草稿版本");
      if (body.action === "rollback" && record.status === "draft")
        fail(409, "INVALID_TRANSITION", "草稿不可回退");
      const status = body.action === "withdraw" ? "withdrawn" : "published";
      const changed = await tx.layoutVersion.updateMany({
        where: { id, revision: body.revision },
        data: { status, revision: { increment: 1 } },
      });
      if (changed.count !== 1) fail(409, "STALE_LAYOUT", "布局已更新");
      if (status === "published")
        await tx.venue.update({
          where: { id: record.venueId },
          data: { currentLayoutId: id },
        });
      else
        await tx.venue.updateMany({
          where: { id: record.venueId, currentLayoutId: id },
          data: { currentLayoutId: null },
        });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: `layout.${body.action}`,
          targetId: id,
          summary: { revision: body.revision! },
        },
      });
      return { ok: true, status };
    });
  }
}
