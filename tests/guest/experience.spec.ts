import { test, expect, type Page } from "@playwright/test";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

async function selectSeat(page: Page, row: string, seat: string) {
  await page.getByRole("textbox", { name: "排号" }).fill(row);
  await page.getByRole("textbox", { name: "座号" }).fill(seat);
  await page.getByRole("button", { name: "查找", exact: true }).click();
}

test("the single file works offline through selection, 3D, comparison and bookmarks", async ({
  page,
  context,
}, testInfo) => {
  const file = testInfo.outputPath("LIVERSE 体验.html");
  await mkdir(dirname(file), { recursive: true });
  await copyFile("dist/guest/index.html", file);
  const url = pathToFileURL(file).href;
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url() !== url) requests.push(request.url());
  });
  await context.setOffline(true);
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "LIVERSE 北京" })).toBeVisible();
  await expect(page.getByText("开发示例 · 非正式场馆排座与模型")).toBeVisible();
  await expect(page.getByRole("link", { name: "运营工作台" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "实拍", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );

  await page.getByRole("button", { name: "进入看座" }).click();
  await selectSeat(page, "D01", "01");
  await page.getByRole("button", { name: "收藏位置" }).click();
  await page.getByRole("button", { name: "查看视野" }).click();
  const view = page.getByLabel("开发示例 3D 视角");
  await expect(view).toBeVisible();
  await expect(page.locator(".p-model-error")).toHaveCount(0);
  const seated = await view.screenshot();
  await page.getByRole("checkbox", { name: "站姿模拟" }).check();
  await expect.poll(async () => (await view.screenshot()).equals(seated)).toBe(false);
  await expect(page.getByRole("button", { name: "分享位置" })).toHaveCount(0);
  await page.getByRole("button", { name: "加入对比" }).click();
  await page.getByRole("button", { name: "继续选择位置" }).click();
  await page.getByRole("button", { name: "示例 2F" }).click();
  await selectSeat(page, "D02", "09");
  await page.getByRole("button", { name: "加入对比" }).click();
  await page.getByRole("button", { name: "对比 2/2" }).click();
  await expect(page.locator(".p-compare-tabs > button")).toHaveCount(2);
  await expect(page.locator(".p-compare-tabs")).toContainText("示例 2F · D02 排 09 号");

  await page.reload();
  await page.getByRole("button", { name: "我的" }).click();
  await page.getByRole("button", { name: "全部收藏" }).click();
  await expect(page.getByRole("button", { name: "示例 1F · D01 排 01 号" })).toBeVisible();
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("static hosting opens a shared seat without contacting an API", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined });
    Object.defineProperty(navigator, "share", { value: undefined });
  });
  const requests: string[] = [];
  context.on("request", (request) => {
    if (!request.isNavigationRequest()) requests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "进入看座" }).click();
  await selectSeat(page, "D03", "06");
  await page.getByRole("button", { name: "查看视野" }).click();
  await page.getByRole("button", { name: "分享位置" }).click();
  const link = await page.getByRole("textbox", { name: "位置链接" }).inputValue();
  const recipient = await context.newPage();
  await recipient.goto(link);
  await expect(recipient.getByRole("heading", { name: "示例 1F · D03 排 06 号" })).toBeVisible();
  await expect(recipient.getByLabel("开发示例 3D 视角")).toBeVisible();
  expect(requests).toEqual([]);
});
