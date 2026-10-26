import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
export function fail(status: number, code: string, message: string): never {
  throw new HttpException({ code, message }, status);
}
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "服务暂不可用，请稍后重试";
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      if (typeof body === "object") {
        code = (body as { code?: string }).code ?? "INVALID_REQUEST";
        message = (body as { message?: string }).message ?? "请求无效";
      }
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    ) {
      status = 409;
      code = "CONFLICT";
      message = "请求发生冲突，请刷新后重试";
    }
    res.status(status).json({
      code,
      message,
      requestId: res.getHeader("X-Request-Id") ?? req.headers["x-request-id"],
    });
  }
}
