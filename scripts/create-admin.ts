import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
const username = process.env.ADMIN_USERNAME,
  password = process.env.ADMIN_PASSWORD,
  role = process.env.ADMIN_ROLE ?? "system";
if (
  !username ||
  !password ||
  password.length < 14 ||
  !["system", "content", "layout"].includes(role)
)
  throw new Error(
    "Set ADMIN_USERNAME, ADMIN_PASSWORD (14+ characters), and optional ADMIN_ROLE",
  );
if (process.env.NODE_ENV === "production" && !process.env.ADMIN_TOTP_SECRET)
  throw new Error("Production admin requires ADMIN_TOTP_SECRET");
const db = new PrismaClient();
await db.admin.create({
  data: {
    username,
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    role,
    totpSecret: process.env.ADMIN_TOTP_SECRET || null,
  },
});
await db.$disconnect();
console.log("Admin created. Password and TOTP secret were not logged.");
