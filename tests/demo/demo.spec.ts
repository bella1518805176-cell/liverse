import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("standalone visitor can select, inspect, compare and share without a backend", async ({
  page,
}, testInfo) => {
  const errors: string[] = [],
    apiRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("unavailable")) },
      configurable: true,
    });
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "LIVERSE 北京" }),
  ).toBeVisible();
  await expect(page.getByText("运营工作台", { exact: true })).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".p-logo")
        .evaluate((element) => getComputedStyle(element).color),
    )
    .toBe("rgb(245, 246, 247)");
  expect(
    await page
      .locator("body")
      .evaluate((element) => getComputedStyle(element).margin),
  ).toBe("0px");
  await expect
    .poll(() =>
      page
        .locator(".p-hero img")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "进入看座" }).click();
  await page.getByRole("textbox", { name: "排号" }).fill("D01");
  await page.getByRole("textbox", { name: "座号" }).fill("01");
  await page.getByRole("button", { name: "查找", exact: true }).click();
  await page.getByRole("button", { name: "收藏位置", exact: true }).click();
  await page.getByRole("button", { name: "查看视野" }).click();
  const canvas = page.getByLabel("开发示例 3D 视角");
  await expect(canvas).toBeVisible();
  const before = await canvas.screenshot();
  const pixels = await sharp(before)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = new Set<string>();
  for (let i = 0; i < pixels.data.length; i += pixels.info.channels * 20)
    colors.add(pixels.data.subarray(i, i + 3).toString("hex"));
  expect(colors.size).toBeGreaterThan(20);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 70,
    box.y + box.height / 2 + 10,
    { steps: 10 },
  );
  await page.mouse.up();
  expect(before.equals(await canvas.screenshot())).toBe(false);
  await page.getByRole("checkbox", { name: "站姿模拟" }).check();
  await page.getByRole("button", { name: "分享位置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "分享位置链接" });
  await expect(dialog).toBeVisible();
  const url = await dialog
    .getByRole("textbox", { name: "位置链接" })
    .inputValue();
  await dialog.getByRole("button", { name: "关闭分享" }).click();
  await page.getByRole("button", { name: "加入对比", exact: true }).click();
  await page.getByRole("button", { name: "继续选择位置" }).click();
  await page.getByRole("textbox", { name: "排号" }).fill("D03");
  await page.getByRole("textbox", { name: "座号" }).fill("09");
  await page.getByRole("button", { name: "查找", exact: true }).click();
  await page.getByRole("button", { name: "加入对比", exact: true }).click();
  await page.getByRole("button", { name: /对比 2\/2/ }).click();
  await expect(page.locator(".p-compare-tabs>button")).toHaveCount(2);
  await page.locator(".p-compare-tabs>button").nth(1).click();
  await expect(canvas).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `output/verification/demo-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.goto(url);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "示例 1F · D01 排 01 号" }),
  ).toBeVisible();
  await expect(canvas).toBeVisible();
  await page.goto("./");
  await page.reload();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "全部收藏", exact: true }).click();
  await expect(page.locator(".p-record")).toHaveCount(1);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("public demo server exposes only static assets", async ({ request }) => {
  test.skip(
    !!process.env.DEMO_BASE_URL,
    "Local static server contract is tested separately from the managed hosting gateway",
  );
  for (const path of [
    "/api/v1/admin/me",
    "/api/v1/health",
    "/server.mjs",
    "/.env",
    "/README.txt",
    "/assets/../../package.json",
  ]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  expect((await request.post("/")).status()).toBe(405);
  const home = await request.get("/");
  expect(home.headers()["content-type"]).toContain("text/html");
  expect(home.headers()["cache-control"]).toBe("no-store");
});
