import "dotenv/config";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
test("operator reviews content and leaves an audit trail", async ({
  page,
}, testInfo) => {
  if (
    process.env.NODE_ENV === "production" ||
    !process.env.DATABASE_URL?.includes("127.0.0.1:55432/liverse")
  )
    throw new Error("Admin E2E requires the local development database");
  const db = new PrismaClient();
  const suffix = randomUUID().slice(0, 8),
    username = `e2e_${suffix}`,
    password = randomUUID();
  const admin = await db.admin.create({
    data: {
      username,
      passwordHash: await argon2.hash(password),
      role: "system",
    },
  });
  const user = await db.user.create({ data: { wechatKey: `e2e:${suffix}` } });
  const contribution = await db.contribution.create({
    data: {
      userId: user.id,
      venueId: "beijing",
      layoutId: "beijing-demo-v1",
      position: {
        venueId: "beijing",
        layoutVersionId: "beijing-demo-v1",
        kind: "venue",
      },
      text: `E2E 审核验证 ${suffix}`,
      tags: [],
      displayName: "自动化测试",
      consentAt: new Date(),
    },
  });
  try {
    await page.goto("/");
    await page.getByLabel("运营账号").fill(username);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("heading", { name: "工作概览" })).toBeVisible();
    await page.getByRole("button", { name: "内容审核", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: contribution.text });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "通过", exact: true }).click();
    await page.getByRole("button", { name: "确认", exact: true }).click();
    await expect(row.getByText("已公开", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "录入官方资料" }).click();
    const editor = page.getByRole("dialog", { name: "录入官方参考资料" });
    await editor.getByLabel("素材说明与来源").fill(`官方参考测试 ${suffix}`);
    await editor.getByRole("checkbox").check();
    await editor.getByRole("button", { name: "保存并送审" }).click();
    await expect(editor).not.toBeVisible();
    const officialRow = page
      .getByRole("row")
      .filter({ hasText: `官方参考测试 ${suffix}` });
    await expect(officialRow.getByText("官方", { exact: true })).toBeVisible();
    await expect(
      officialRow.getByText("待审核", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "操作记录", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: contribution.id, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `output/verification/${testInfo.project.name}-admin-audit.png`,
      fullPage: true,
    });
  } finally {
    await db.auditLog.deleteMany({ where: { actorId: admin.id } });
    await db.adminSession.deleteMany({ where: { adminId: admin.id } });
    await db.admin.delete({ where: { id: admin.id } });
    await db.contribution.delete({ where: { id: contribution.id } });
    await db.user.delete({ where: { id: user.id } });
    const official = await db.user.findUnique({
      where: { wechatKey: `official:${admin.id}` },
    });
    if (official) {
      await db.idempotency.deleteMany({ where: { actorId: official.id } });
      await db.contribution.deleteMany({ where: { userId: official.id } });
      await db.user.delete({ where: { id: official.id } });
    }
    await db.$disconnect();
  }
});
