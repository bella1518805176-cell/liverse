import { test, expect } from "@playwright/test";

test("Shanghai seating explorer keeps the selected position in one page", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "找到你的现场位置" })).toBeVisible();
  await expect(page.getByText("全坐席（有过道）1184").first()).toBeVisible();
  await expect(page.getByText("1F 中区有 7 个座位编号待核对；后区为站席示意，不展示座位点。")).toBeVisible();
  await expect(page.locator(".standing-zone")).toHaveAttribute("aria-label", "站席 有遮挡（200人）");
  await expect(page.locator('.seat[aria-label^="1F后区"]')).toHaveCount(0);
  await expect(page.getByText("697 个座位 · 站席 200 人")).toBeVisible();
  const frontRowSeats = page.locator('.seat[aria-label^="1F前区 1排"]');
  await expect(frontRowSeats).toHaveCount(40);
  await expect(page.getByRole("button", { name: "1F前区 1排40号" })).toHaveCount(1);
  const seatGaps = await frontRowSeats.evaluateAll((groups) => {
    const xs = groups.map((group) => Number(group.querySelector("circle")?.getAttribute("cx")));
    return xs.slice(1).map((x, index) => x - xs[index]);
  });
  expect(new Set(seatGaps).size).toBe(1);
  await page.screenshot({ path: `output/verification/shanghai-standing-${testInfo.project.name}.png`, fullPage: true });
  await expect(page.getByRole("button", { name: "从这里看舞台" })).toBeDisabled();
  await page.getByRole("button", { name: "选位置" }).click();
  await expect(page.locator("#row-select option")).toHaveCount(19);
  await expect(page.locator("#row-select option[value='20']")).toHaveCount(0);
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "选择场馆" }).click();
  await expect(page.getByRole("dialog", { name: "选择场馆" })).toBeVisible();
  await expect(page.getByText("上海 · 音宇宙艺术中心").last()).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "选择场次" }).click();
  await page.getByRole("button", { name: /演示场次 B/ }).click();
  await expect(page.getByRole("button", { name: "选择场次" })).toContainText("演示场次 B");
  await page.getByRole("button", { name: "1F前区 1排1号" }).click();
  await expect(page.getByText("上海 LIVERSE · 1F前区 · 1排1号")).toBeVisible();
  await page.getByRole("button", { name: "从这里看舞台" }).click();
  await expect(page.locator(".scene-title")).toHaveText("观众视角");
  await expect(page.locator(".scene-location")).toContainText("1排1号");

  await page.getByRole("button", { name: /3D 视图/ }).click();
  await expect(page.getByText("3D 模型暂未接入")).toBeVisible();
  await page.getByRole("button", { name: /观众视角/ }).click();
  await expect(page.locator(".scene-title")).toHaveText("观众视角");
  await expect(page.locator(".scene-location")).toContainText("1排1号");
  await page.getByRole("button", { name: /手机取景/ }).click();
  await expect(page.locator(".viewfinder")).toBeVisible();

  await page.getByRole("button", { name: "更换", exact: true }).click();
  await page.getByRole("dialog", { name: "选择位置" }).getByRole("button", { name: "2F 二楼", exact: true }).click();
  await page.getByRole("button", { name: "确认位置" }).click();
  await expect(page.locator(".selection-copy strong")).toHaveText("上海 LIVERSE · 2F固定坐席 · 1排1号");
  await expect(page.locator(".scene-title")).toHaveText("手机取景");
  await page.getByRole("button", { name: "从这里看舞台" }).click();
  await expect(page.locator(".scene-title")).toHaveText("观众视角");
  await page.getByRole("button", { name: /手机取景/ }).click();
  await page.getByRole("button", { name: "回到 2D 座位图" }).click();
  await expect(page.locator(".floor-toggle button").nth(1)).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "2F固定坐席 1排1号" })).toHaveClass(/selected/);
  await page.getByRole("button", { name: "放大" }).click();
  await page.getByRole("button", { name: "放大" }).click();
  await page.getByRole("button", { name: "放大" }).click();
  await expect(page.locator(".seat-number").first()).toBeVisible();
  await page.getByRole("button", { name: "复位" }).click();

  await page.getByRole("button", { name: "清除选择" }).click();
  await expect(page.getByText("尚未选择位置")).toBeVisible();
  await expect(page.locator(".seat.selected")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `output/verification/shanghai-demo-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("public demo server exposes only static assets", async ({ request }) => {
  test.skip(!!process.env.DEMO_BASE_URL, "Local static server contract is tested separately from the managed hosting gateway");
  for (const path of ["/api/v1/admin/me", "/api/v1/health", "/server.mjs", "/.env", "/README.txt", "/assets/../../package.json"]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  expect((await request.post("/")).status()).toBe(405);
  const home = await request.get("/");
  expect(home.headers()["content-type"]).toContain("text/html");
  expect(home.headers()["cache-control"]).toBe("no-store");
});
