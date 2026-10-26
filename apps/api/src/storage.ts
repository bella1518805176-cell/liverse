import { Injectable } from "@nestjs/common";
import COS from "cos-nodejs-sdk-v5";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { production } from "./config";
import { fail } from "./errors";
@Injectable()
export class Storage {
  private cos = process.env.COS_BUCKET
    ? new COS({
        SecretId: process.env.COS_SECRET_ID,
        SecretKey: process.env.COS_SECRET_KEY,
      })
    : null;
  private key(key: string) {
    if (!/^(original|derived)\/[a-zA-Z0-9_-]+\.(bin|webp)$/.test(key))
      throw new Error("Invalid object key");
    return path.resolve(".local/media", key);
  }
  async put(key: string, body: Buffer) {
    if (this.cos) {
      await this.cos.putObject({
        Bucket: process.env.COS_BUCKET!,
        Region: process.env.COS_REGION!,
        Key: key,
        Body: body,
      });
      return;
    }
    if (production()) fail(503, "STORAGE_UNAVAILABLE", "媒体存储未配置");
    const file = this.key(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  async get(key: string): Promise<Buffer> {
    if (this.cos) {
      const result = await this.cos.getObject({
        Bucket: process.env.COS_BUCKET!,
        Region: process.env.COS_REGION!,
        Key: key,
      });
      return Buffer.from(result.Body as Buffer);
    }
    return readFile(this.key(key));
  }
  async remove(key: string) {
    if (this.cos)
      await this.cos.deleteObject({
        Bucket: process.env.COS_BUCKET!,
        Region: process.env.COS_REGION!,
        Key: key,
      });
    else await unlink(this.key(key)).catch(() => undefined);
  }
}
