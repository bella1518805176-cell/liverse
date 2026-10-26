import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import express from "express";
import path from "node:path";
import { Database } from "./db";
import { AppService } from "./service";
import { AuthService } from "./auth";
import { ApiController, AdminController } from "./controller";
import { MediaService } from "./media";
import { Storage } from "./storage";
import { ErrorFilter } from "./errors";
import { UserUploadGuard, AdminUploadGuard } from "./upload-guard";
@Module({
  controllers: [ApiController, AdminController],
  providers: [
    Database,
    AppService,
    AuthService,
    MediaService,
    Storage,
    UserUploadGuard,
    AdminUploadGuard,
  ],
})
class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === "test" ? false : ["error", "warn", "log"],
  });
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cookieParser());
  const buckets = new Map<string, { count: number; until: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Request-Id", randomUUID());
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method === "GET" || req.method === "HEAD") return next();
    const now = Date.now();
    if (buckets.size > 10000)
      for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
    const key = `${req.ip}:${req.path.includes("/auth") || req.path.endsWith("/login") ? "auth" : "write"}`;
    const b = buckets.get(key);
    const current = b && b.until > now ? b : { count: 0, until: now + 60000 };
    current.count++;
    buckets.set(key, current);
    if (current.count > (key.endsWith("auth") ? 20 : 120)) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({
        code: "RATE_LIMITED",
        message: "操作过于频繁，请稍后重试",
        requestId: res.getHeader("X-Request-Id"),
      });
    }
    next();
  });
  app.use(
    "/assets",
    express.static(path.resolve("assets/public"), { maxAge: "1h" }),
  );
  app.useGlobalFilters(new ErrorFilter());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("LIVERSE API")
      .setVersion("1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("api/docs", app, document);
  app.enableShutdownHooks();
  return app;
}
