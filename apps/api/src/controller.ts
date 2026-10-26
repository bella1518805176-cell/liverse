import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { AppService } from "./service";
import { AuthService } from "./auth";
import { MediaService } from "./media";
import { production } from "./config";
import { fail } from "./errors";
import { UserUploadGuard, AdminUploadGuard } from "./upload-guard";
import type { Layout } from "../../../packages/contracts";
@ApiTags("LIVERSE")
@Controller("api/v1")
export class ApiController {
  constructor(
    @Inject(AppService) private service: AppService,
    @Inject(AuthService) private auth: AuthService,
    @Inject(MediaService) private media: MediaService,
  ) {}
  @Get("health") async health() {
    await this.service.db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
  @Get("config") config() {
    return {
      contactEmail: process.env.CONTACT_EMAIL ?? "",
      development: !production(),
      ugcEnabled: true,
    };
  }
  @Get("venues") venues() {
    return this.service.venues();
  }
  @Get("layouts/:id") layout(@Param("id") id: string) {
    return this.service.layout(id);
  }
  @Get("events") events(@Query("venueId") venueId: string) {
    return this.service.db.event.findMany({
      where: { venueId: venueId || "beijing" },
      orderBy: { localDate: "desc" },
    });
  }
  @Post("positions/resolve") position(@Body() body: unknown) {
    return this.service.position(body);
  }
  @Get("contributions") content(@Query() query: Record<string, string>) {
    return this.service.listContent(query);
  }
  @Get("contributions/:id") detail(@Param("id") id: string) {
    return this.service.publicContent(id);
  }
  @Post("auth/wechat") login(
    @Body() b: { code?: unknown; devIdentity?: unknown },
  ) {
    return this.auth.login(b.code, b.devIdentity);
  }
  @Post("auth/refresh") refresh(@Body() b: { refreshToken?: unknown }) {
    return this.auth.refresh(b.refreshToken);
  }
  @Post("auth/logout") logout(@Req() r: Request) {
    return this.auth.logout(r);
  }
  @Get("me") async me(@Req() r: Request) {
    const u = await this.auth.user(r);
    return { id: u.id, displayName: u.displayName };
  }
  @Put("me") async profile(
    @Req() r: Request,
    @Body() b: { displayName?: unknown },
  ) {
    const u = await this.auth.user(r);
    if (
      typeof b.displayName !== "string" ||
      !b.displayName.trim() ||
      b.displayName.length > 30
    )
      fail(400, "INVALID_NAME", "昵称应为 1 至 30 字");
    return this.service.db.user.update({
      where: { id: u.id },
      data: { displayName: b.displayName.trim() },
      select: { id: true, displayName: true },
    });
  }
  @Get("me/favorites") favorites(@Req() r: Request) {
    return this.service.favorites(r);
  }
  @Put("me/favorites") favorite(
    @Req() r: Request,
    @Body() b: { position?: unknown; enabled?: unknown },
  ) {
    if (typeof b.enabled !== "boolean")
      fail(400, "INVALID_REQUEST", "收藏状态无效");
    return this.service.setFavorite(r, b.position, b.enabled);
  }
  @Get("me/contributions") async ownContent(@Req() r: Request) {
    const u = await this.auth.user(r);
    return this.service.db.contribution.findMany({
      where: { userId: u.id },
      select: {
        id: true,
        position: true,
        text: true,
        state: true,
        reason: true,
        createdAt: true,
      },
      take: 100,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }
  @Post("me/contributions") contribute(@Req() r: Request, @Body() b: unknown) {
    return this.service.contribute(r, b);
  }
  @Delete("me/contributions/:id") remove(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.service.deleteContribution(r, id);
  }
  @Put("contributions/:id/helpful") helpful(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: { enabled?: unknown },
  ) {
    if (typeof b.enabled !== "boolean")
      fail(400, "INVALID_REQUEST", "操作无效");
    return this.service.helpful(r, id, b.enabled);
  }
  @Get("me/tickets") async tickets(@Req() r: Request) {
    const u = await this.auth.user(r);
    return this.service.db.ticket.findMany({
      where: { userId: u.id },
      select: {
        id: true,
        category: true,
        text: true,
        targetId: true,
        status: true,
        reply: true,
        createdAt: true,
        revision: true,
      },
      take: 100,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }
  @Post("me/tickets") ticket(@Req() r: Request, @Body() b: object) {
    return this.service.createTicket(r, b);
  }
  @Post("uploads") uploadCreate(@Req() r: Request) {
    return this.media.create(r);
  }
  @Post("uploads/:id/file")
  @UseGuards(UserUploadGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Req() r: Request,
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.media.upload(r, id, file);
  }
  @Get("uploads/:id") uploadStatus(@Req() r: Request, @Param("id") id: string) {
    return this.media.status(r, id);
  }
  @Get("media/:id") mediaFile(
    @Req() r: Request,
    @Res() res: Response,
    @Param("id") id: string,
  ) {
    return this.media.serve(r, res, id);
  }
}
@ApiTags("运营")
@Controller("api/v1/admin")
export class AdminController {
  @Get("published-layouts") async publishedLayouts(@Req() r: Request) {
    await this.auth.admin(r, "content");
    return this.service.db.layoutVersion.findMany({
      where: { status: "published" },
      select: { data: true, status: true },
    });
  }
  @Post("official-content") official(@Req() r: Request, @Body() b: unknown) {
    return this.service.contribute(r, b, true);
  }
  @Post("uploads") createUpload(@Req() r: Request) {
    return this.media.create(r, true);
  }
  @Post("uploads/:id/file")
  @UseGuards(AdminUploadGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Req() r: Request,
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.media.upload(r, id, file, true);
  }
  @Get("uploads/:id") async uploadStatus(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    const u = await this.auth.officialUser(r);
    const media = await this.service.db.media.findFirst({
      where: { id, userId: u.id },
      select: { id: true, state: true },
    });
    if (!media) fail(404, "NOT_FOUND", "图片不存在");
    return media;
  }
  constructor(
    @Inject(AppService) private service: AppService,
    @Inject(AuthService) private auth: AuthService,
    @Inject(MediaService) private media: MediaService,
  ) {}
  @Post("login") async login(
    @Body() b: { username?: unknown; password?: unknown; otp?: unknown },
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = await this.auth.adminLogin(b.username, b.password, b.otp);
    res.cookie("lv_admin", s.raw, {
      httpOnly: true,
      sameSite: "strict",
      secure: production(),
      maxAge: 28800000,
      path: "/api/v1/admin",
    });
    return { csrf: s.csrf, role: s.role };
  }
  @Get("me") async me(@Req() r: Request) {
    const a = await this.auth.admin(r);
    return { username: a.username, role: a.role, csrf: a.csrf };
  }
  @Post("logout") async logout(
    @Req() r: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.admin(r);
    const raw = r.cookies?.lv_admin as string;
    const { digest } = await import("./auth");
    await this.service.db.adminSession.deleteMany({
      where: { hash: digest(raw) },
    });
    res.clearCookie("lv_admin", { path: "/api/v1/admin" });
    return { ok: true };
  }
  @Get("overview") async overview(@Req() r: Request) {
    await this.auth.admin(r);
    const db = this.service.db;
    return {
      pending: await db.contribution.count({ where: { state: "pending" } }),
      published: await db.contribution.count({ where: { state: "published" } }),
      tickets: await db.ticket.count({
        where: { status: { in: ["received", "processing"] } },
      }),
      failedJobs: await db.job.count({ where: { state: "failed" } }),
    };
  }
  @Get("contributions") async content(@Req() r: Request) {
    await this.auth.admin(r, "content");
    return this.service.db.contribution.findMany({
      take: 100,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { media: { select: { id: true, state: true } } },
    });
  }
  @Post("contributions/:id/review") review(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: object,
  ) {
    return this.service.review(r, id, b);
  }
  @Get("media/:id") file(
    @Req() r: Request,
    @Res() res: Response,
    @Param("id") id: string,
  ) {
    return this.media.serve(r, res, id, true);
  }
  @Get("layouts") async layouts(@Req() r: Request) {
    await this.auth.admin(r, "layout");
    return this.service.db.layoutVersion.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Post("layouts") save(@Req() r: Request, @Body() b: Layout) {
    return this.service.saveLayout(r, b);
  }
  @Post("layouts/:id/publish") publish(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: object,
  ) {
    return this.service.publishLayout(r, id, b);
  }
  @Get("tickets") async tickets(@Req() r: Request) {
    await this.auth.admin(r, "content");
    return this.service.db.ticket.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        category: true,
        text: true,
        targetId: true,
        status: true,
        reply: true,
        revision: true,
        createdAt: true,
      },
    });
  }
  @Post("tickets/:id/reply") async reply(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: { status?: unknown; reply?: unknown; revision?: number },
  ) {
    const a = await this.auth.admin(r, "content");
    if (
      !["processing", "resolved", "declined"].includes(String(b.status)) ||
      typeof b.reply !== "string" ||
      !b.reply.trim() ||
      b.reply.length > 1000 ||
      !Number.isInteger(b.revision)
    )
      fail(400, "INVALID_REPLY", "请填写处理说明");
    return this.service.db.$transaction(async (tx) => {
      const changed = await tx.ticket.updateMany({
        where: { id, revision: b.revision },
        data: {
          status: String(b.status),
          reply: String(b.reply),
          revision: { increment: 1 },
        },
      });
      if (!changed.count) fail(409, "STALE_TICKET", "工单已更新，请刷新");
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "ticket.reply",
          targetId: id,
          summary: { status: String(b.status) },
        },
      });
      return { ok: true };
    });
  }
  @Get("audit") async audit(@Req() r: Request) {
    await this.auth.admin(r);
    return this.service.db.auditLog.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  }
  @Get("jobs") async jobs(@Req() r: Request) {
    await this.auth.admin(r, "system");
    return this.service.db.job.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  }
}
