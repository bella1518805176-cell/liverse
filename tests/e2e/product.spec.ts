import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
test("home, exact search, interactive 3D, favorites and compare across viewports", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?preview=1");
  await expect(
    page.getByRole("heading", { name: "LIVERSE 北京" }),
  ).toBeVisible();
  const imageLoaded = await page
    .locator(".p-hero img")
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(imageLoaded).toBe(true);
  await mkdir("output/verification", { recursive: true });
  await page.screenshot({
    path: `output/verification/${testInfo.project.name}-home.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "进入看座" }).click();
  await page.getByRole("textbox", { name: "排号" }).fill("bad");
  await page.getByRole("textbox", { name: "座号" }).fill("01");
  await page.getByRole("button", { name: "查找", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("未找到");
  await page.getByRole("textbox", { name: "排号" }).fill("D01");
  await page.getByRole("button", { name: "查找", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "示例 1F · D01 排 01 号" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "收藏位置", exact: true }).click();
  await page.screenshot({
    path: `output/verification/${testInfo.project.name}-map.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "查看视野" }).click();
  const canvas = page.getByLabel("开发示例 3D 视角");
  await expect(canvas).toBeVisible();
  await expect(page.locator(".p-model-error")).toHaveCount(0);
  const frame = await canvas.screenshot();
  const data = await sharp(frame).raw().toBuffer({ resolveWithObject: true });
  const colors = new Set<string>();
  for (let i = 0; i < data.data.length; i += data.info.channels * 20)
    colors.add(data.data.subarray(i, i + 3).toString("hex"));
  expect(colors.size).toBeGreaterThan(20);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 + 20,
    { steps: 10 },
  );
  await page.mouse.up();
  const after = await canvas.screenshot();
  expect(frame.equals(after)).toBe(false);
  await page.getByRole("checkbox", { name: "站姿模拟" }).check();
  await page.getByRole("button", { name: "复位视角" }).click();
  await page.screenshot({
    path: `output/verification/${testInfo.project.name}-3d.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "加入对比" }).click();
  await page.getByRole("button", { name: "继续选择位置" }).click();
  await page.getByRole("textbox", { name: "排号" }).fill("D03");
  await page.getByRole("textbox", { name: "座号" }).fill("09");
  await page.getByRole("button", { name: "查找", exact: true }).click();
  await page.getByRole("button", { name: "加入对比", exact: true }).click();
  await page.getByRole("button", { name: /对比 2\/2/ }).click();
  await expect(page.locator(".p-compare-tabs>button")).toHaveCount(2);
  const reference = await page.evaluate(
    () => JSON.parse(localStorage.getItem("lv:preview:favorites")!)[0],
  );
  await page.goto(
    "/?preview=1#" + encodeURIComponent(JSON.stringify(reference)),
  );
  await expect(page.getByLabel("开发示例 3D 视角")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "示例 1F · D01 排 01 号" }),
  ).toBeVisible();
  await page.goto("/?preview=1");
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "全部收藏" }).click();
  await expect(page.locator(".p-record")).toHaveCount(1);
  await page.getByRole("button", { name: "实拍", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "还没有公开的现场分享" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("admin login gives real error and responsive form", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "登录管理后台" }),
  ).toBeVisible();
  await page.getByLabel("运营账号").fill("missing");
  await page.getByLabel("密码", { exact: true }).fill("invalid-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("账号或密码无效")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `output/verification/${testInfo.project.name}-admin-login.png`,
    fullPage: true,
  });
});
