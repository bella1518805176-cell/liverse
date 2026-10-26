import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request } from "express";
import argon2 from "argon2";
import { authenticator } from "otplib";
import { Database } from "./db";
import { fail } from "./errors";
import { production } from "./config";
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
@Injectable()
export class AuthService {
  async officialUser(req: Request) {
    const admin = await this.admin(req, "content");
    return this.db.user.upsert({
      where: { wechatKey: `official:${admin.id}` },
      create: {
        wechatKey: `official:${admin.id}`,
        displayName: "LIVERSE 官方",
      },
      update: {},
    });
  }
  constructor(@Inject(Database) private db: Database) {}
  async login(code: unknown, devIdentity?: unknown) {
    let wechatKey: string;
    if (
      !production() &&
      process.env.ENABLE_DEV_LOGIN === "true" &&
      typeof devIdentity === "string" &&
      /^[a-z0-9_-]{1,40}$/i.test(devIdentity)
    )
      wechatKey = `development:${devIdentity}`;
    else {
      if (typeof code !== "string" || !code || code.length > 256)
        fail(400, "LOGIN_CODE_REQUIRED", "请重新获取微信登录凭证");
      if (!process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET)
        fail(503, "WECHAT_NOT_CONFIGURED", "微信登录尚未配置");
      const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
      url.search = new URLSearchParams({
        appid: process.env.WECHAT_APP_ID,
        secret: process.env.WECHAT_APP_SECRET,
        js_code: code,
        grant_type: "authorization_code",
      }).toString();
      const result = (await fetch(url, {
        signal: AbortSignal.timeout(8000),
      }).then((r) => r.json())) as { openid?: string; errcode?: number };
      if (!result.openid || result.errcode)
        fail(401, "WECHAT_LOGIN_FAILED", "微信登录失败，请重试");
      wechatKey = `${process.env.WECHAT_APP_ID}:${result.openid}`;
    }
    const user = await this.db.user.upsert({
      where: { wechatKey },
      create: { wechatKey },
      update: {},
    });
    if (user.disabled) fail(403, "ACCOUNT_DISABLED", "账号不可用");
    return this.issue(user.id);
  }
  async issue(userId: string, familyId: string = randomUUID()) {
    const accessToken = token(),
      refreshToken = token();
    await this.db.session.create({
      data: {
        userId,
        familyId,
        accessHash: digest(accessToken),
        refreshHash: digest(refreshToken),
        expiresAt: new Date(Date.now() + 1800000),
        refreshUntil: new Date(Date.now() + 604800000),
      },
    });
    return { accessToken, refreshToken, expiresIn: 1800, user: { id: userId } };
  }
  async refresh(raw: unknown) {
    if (typeof raw !== "string") fail(401, "SESSION_EXPIRED", "请重新登录");
    const session = await this.db.session.findUnique({
      where: { refreshHash: digest(raw) },
      include: { user: true },
    });
    if (!session) fail(401, "SESSION_EXPIRED", "请重新登录");
    if (session.revoked) {
      await this.db.session.updateMany({
        where: { familyId: session.familyId },
        data: { revoked: true },
      });
      fail(401, "REFRESH_REUSED", "登录凭证已使用，请重新登录");
    }
    if (session.refreshUntil.getTime() < Date.now() || session.user.disabled)
      fail(401, "SESSION_EXPIRED", "请重新登录");
    const claimed = await this.db.session.updateMany({
      where: { id: session.id, revoked: false },
      data: { revoked: true },
    });
    if (claimed.count !== 1) {
      await this.db.session.updateMany({
        where: { familyId: session.familyId },
        data: { revoked: true },
      });
      fail(401, "REFRESH_REUSED", "请重新登录");
    }
    return this.issue(session.userId, session.familyId);
  }
  async user(req: Request) {
    const bearer = req.headers.authorization?.match(
      /^Bearer ([A-Za-z0-9_-]{40,100})$/,
    )?.[1];
    if (!bearer) fail(401, "LOGIN_REQUIRED", "请先登录");
    const s = await this.db.session.findUnique({
      where: { accessHash: digest(bearer) },
      include: { user: true },
    });
    if (
      !s ||
      s.revoked ||
      s.expiresAt.getTime() < Date.now() ||
      s.user.disabled
    )
      fail(401, "SESSION_EXPIRED", "登录已过期");
    return s.user;
  }
  async logout(req: Request) {
    const user = await this.user(req);
    await this.db.session.updateMany({
      where: { userId: user.id },
      data: { revoked: true },
    });
    return { ok: true };
  }
  async adminLogin(username: unknown, password: unknown, otp: unknown) {
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      password.length > 200
    )
      fail(401, "INVALID_CREDENTIALS", "账号或密码无效");
    const admin = await this.db.admin.findUnique({ where: { username } });
    if (!admin || !(await argon2.verify(admin.passwordHash, password)))
      fail(401, "INVALID_CREDENTIALS", "账号或密码无效");
    if (
      (production() && !admin.totpSecret) ||
      (admin.totpSecret &&
        (typeof otp !== "string" ||
          !authenticator.check(otp, admin.totpSecret)))
    )
      fail(401, "OTP_REQUIRED", "请提供有效的二次验证码");
    const raw = token(),
      csrf = token();
    await this.db.adminSession.create({
      data: {
        hash: digest(raw),
        adminId: admin.id,
        csrf,
        expiresAt: new Date(Date.now() + 28800000),
      },
    });
    return { raw, csrf, role: admin.role };
  }
  async admin(
    req: Request,
    permission: "read" | "content" | "layout" | "system" = "read",
  ) {
    const raw = (req.cookies as Record<string, string> | undefined)?.lv_admin;
    const s = raw
      ? await this.db.adminSession.findUnique({
          where: { hash: digest(raw) },
          include: { admin: true },
        })
      : null;
    if (!s || s.expiresAt.getTime() < Date.now())
      fail(401, "ADMIN_LOGIN_REQUIRED", "请登录管理后台");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.headers.origin !== process.env.APP_ORIGIN ||
        req.headers["x-csrf-token"] !== s.csrf
      )
        fail(403, "CSRF_FAILED", "请求来源或会话校验失败");
    }
    if (
      permission !== "read" &&
      s.admin.role !== "system" &&
      s.admin.role !== permission
    )
      fail(403, "FORBIDDEN", "当前账号没有此操作权限");
    return { ...s.admin, csrf: s.csrf };
  }
}
