import { test, expect } from "@playwright/test";

test("Shanghai seating explorer keeps the selected position in one page", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page.getByRole("button", { name: "开始看视野" }).click();
  await expect(page.getByRole("heading", { name: "找到你的现场位置" })).toBeVisible();
  await expect(page.getByText("全坐席1208").first()).toBeVisible();
  await expect(page.getByText("1F 前区 480 座、中区 224 座、后区 96 座，合计 800 个坐席。")).toBeVisible();
  await expect(page.locator(".standing-zone")).toHaveCount(0);
  await expect(page.getByText("800 个座位")).toBeVisible();
  const frontRowSeats = page.locator('.seat[aria-label^="1F前区 1排"]');
  await expect(frontRowSeats).toHaveCount(40);
  await expect(page.getByRole("button", { name: "1F前区 1排40号" })).toHaveCount(1);
  const seatGaps = await frontRowSeats.evaluateAll((groups) => {
    const xs = groups.map((group) => Number(group.querySelector("circle")?.getAttribute("cx")));
    return xs.slice(1).map((x, index) => x - xs[index]);
  });
  expect(new Set(seatGaps).size).toBe(1);
  await expect(page.locator('.seat[aria-label^="1F中区 13排"]')).toHaveCount(32);
  await expect(page.getByRole("button", { name: "1F中区 13排32号" })).toHaveCount(1);
  await expect(page.locator('.seat[aria-label^="1F后区 20排"]')).toHaveCount(24);
  await expect(page.getByRole("button", { name: "1F后区 20排24号" })).toHaveCount(1);
  const controlZone = page.locator(".control-zone");
  await expect(controlZone).toHaveAttribute("x", "466");
  await expect(controlZone).toHaveAttribute("y", "500");
  await expect(controlZone).toHaveAttribute("height", "196");
  const middleSeatYs = await page.locator('.seat[aria-label^="1F中区"]').evaluateAll((groups) =>
    groups.map((group) => Number(group.querySelector("circle")?.getAttribute("cy"))),
  );
  expect(Math.min(...middleSeatYs)).toBe(510);
  expect(Math.max(...middleSeatYs)).toBe(672);
  await page.screenshot({ path: `output/verification/shanghai-standing-${testInfo.project.name}.png`, fullPage: true });
  await expect(page.getByRole("button", { name: "从这里看舞台" })).toBeDisabled();
  await page.getByRole("button", { name: "选位置" }).click();
  await expect(page.locator("#row-select option")).toHaveCount(23);
  await expect(page.locator("#row-select option[value='20']")).toHaveCount(1);
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "选择场馆" }).click();
  await expect(page.getByRole("dialog", { name: "选择场馆" })).toBeVisible();
  await expect(page.getByText("上海 · 音宇宙艺术中心").last()).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "选择场次" }).click();
  await page.getByRole("button", { name: /演示场次 B/ }).click();
  await expect(page.getByRole("button", { name: "选择场次" })).toContainText("演示场次 B");
  await page.getByRole("button", { name: "1F前区 1排1号" }).click();
  await expect(page.locator(".selection-copy strong")).toHaveText("上海 LIVERSE · 1F前区 · 1排1号");
  await page.getByRole("button", { name: "从这里看舞台" }).click();
  await expect(page.locator(".scene-title")).toHaveText("观众视角");
  await expect(page.locator(".scene-location")).toContainText("1排1号");

  await page.getByRole("button", { name: /3D 视图/ }).click();
  await expect(page.locator(".venue-canvas")).toHaveAttribute("data-ready", "true");
  await expect(page.getByText("尺寸估算模型")).toBeVisible();
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

test("2F matches the reference blocks, aisle alignment and 15 obstructed seats", async ({ page }, testInfo) => {
  await page.goto("./");
  await page.getByRole("button", { name: "开始看视野" }).click();
  await page.locator(".floor-toggle button").nth(1).click();
  await expect(page.locator(".seat")).toHaveCount(408);
  await expect(page.locator(".seat.obstructed")).toHaveCount(15);
  const actual = await page.locator(".seat").evaluateAll((nodes) => nodes.map((node) => {
    const [, row, number] = node.getAttribute("aria-label")!.match(/ (\d+)排(\d+)号/)!;
    return { row: Number(row), number: Number(number), x: Number(node.querySelector("circle")!.getAttribute("cx")), obstructed: node.classList.contains("obstructed") };
  }));
  const reference = [[6, 17, 6], [9, 17, 8], [10, 17, 10], [10, 17, 10],
    [11, 17, 11], [11, 17, 11], [11, 17, 11], [11, 17, 11], [11, 17, 11],
    [10, 17, 10], [6, 17, 6], [5, 0, 5]];
  let leftBoundary: number | undefined;
  let middleStart: number | undefined;
  let middleEnd: number | undefined;
  let rightBoundary: number | undefined;
  const totals = [0, 0, 0];
  for (const [index, counts] of reference.entries()) {
    const row = actual.filter((seat) => seat.row === index + 1);
    expect(row.map((seat) => seat.number)).toEqual(Array.from({ length: counts.reduce((a, b) => a + b, 0) }, (_, i) => i + 1));
    const left = row.slice(0, counts[0]);
    const middle = row.slice(counts[0], counts[0] + counts[1]);
    const right = row.slice(counts[0] + counts[1]);
    leftBoundary ??= left.at(-1)!.x;
    rightBoundary ??= right[0].x;
    expect(left.at(-1)!.x).toBe(leftBoundary);
    expect(right[0].x).toBe(rightBoundary);
    for (const [i, block] of [left, middle, right].entries()) {
      totals[i] += block.length;
      for (let j = 1; j < block.length; j++) expect(block[j].x - block[j - 1].x).toBe(20);
    }
    if (middle.length) {
      middleStart ??= middle[0].x;
      middleEnd ??= middle.at(-1)!.x;
      expect(middle[0].x).toBe(middleStart);
      expect(middle.at(-1)!.x).toBe(middleEnd);
      expect(middle[0].x - left.at(-1)!.x).toBeGreaterThan(40);
      expect(right[0].x - middle.at(-1)!.x).toBeGreaterThan(40);
    } else {
      expect(right[0].x - left.at(-1)!.x).toBeGreaterThan(middleEnd! - middleStart!);
    }
  }
  expect(totals).toEqual([111, 187, 110]);
  expect(actual.filter((s) => s.obstructed).map((s) => `${s.row}-${s.number}`)).toEqual([
    "2-1", "3-1", "3-37", "4-1", "4-37", "5-1", "5-39", "6-1", "6-39",
    "7-1", "7-39", "8-1", "8-39", "9-1", "9-39",
  ]);
  await expect(page.locator(".data-note")).toContainText("无遮挡 393 座，有遮挡 15 座");
  const regular = page.getByRole("button", { name: "2F固定坐席 1排1号", exact: true });
  const obstructed = page.getByRole("button", { name: "2F固定坐席 2排1号 有遮挡", exact: true });
  expect(await regular.locator("circle").evaluate((node) => getComputedStyle(node).fill))
    .not.toBe(await obstructed.locator("circle").evaluate((node) => getComputedStyle(node).fill));
  await page.screenshot({ path: `output/verification/shanghai-2f-corrected-${testInfo.project.name}.png`, fullPage: true });
  await obstructed.focus();
  await page.keyboard.press("Enter");
  await expect(obstructed).toHaveClass(/selected/);
  await expect(page.locator(".selection-copy strong")).toContainText("2排1号 · 有遮挡");
  await page.getByRole("button", { name: "从这里看舞台" }).click();
  await expect(page.locator(".scene-location")).toContainText("2排1号 · 有遮挡");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("public demo server exposes only static assets", async ({ request }) => {
  test.skip(!!process.env.DEMO_BASE_URL, "Local static server contract is tested separately from the managed hosting gateway");
  const repairPath = await request.get("/%E4%BF%AE%E5%A4%8D", { maxRedirects: 0 });
  expect(repairPath.status()).toBe(302);
  expect(repairPath.headers().location).toBe("/");
  for (const path of ["/api/v1/admin/me", "/api/v1/health", "/server.mjs", "/.env", "/README.txt", "/assets/../../package.json"]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  expect((await request.post("/")).status()).toBe(405);
  const home = await request.get("/");
  expect(home.headers()["content-type"]).toContain("text/html");
  expect(home.headers()["cache-control"]).toBe("no-store");
  const heroImage = await request.get("/assets/liverse-live-audience.webp");
  expect(heroImage.status()).toBe(200);
  expect(heroImage.headers()["content-type"]).toContain("image/webp");
  expect((await request.get("/assets/liverse-logo-reference.png")).status()).toBe(200);
});

test("three product areas expose field references and the shared submission flow", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await expect(page.getByRole("button", { name: "看视野", exact: true })).toHaveClass(/active/);
  await page.getByRole("button", { name: "看视野", exact: true }).click();
  await page.getByRole("button", { name: "1F前区 1排1号" }).click();
  await expect(page.getByRole("heading", { name: "这个位置的现场参考" })).toBeVisible();
  await expect(page.getByRole("button", { name: "该位置实拍" })).toHaveClass(/active/);
  await expect(page.getByText("用户实拍")).toBeVisible();
  await page.getByRole("button", { name: "在现场", exact: true }).click();
  await expect(page.getByRole("heading", { name: "在现场" })).toBeVisible();
  await page.getByRole("button", { name: "上传实拍" }).first().click();
  await expect(page.getByRole("dialog", { name: "上传实拍" })).toBeVisible();
  await expect(page.getByText("请确认这是实际拍摄位置")).toBeVisible();
  await page.getByRole("button", { name: "提交实拍" }).click();
  await expect(page.getByRole("alert")).toContainText("请完成场馆");
  await page.getByRole("button", { name: "关闭" }).last().click();
  await page.getByRole("button", { name: "我的" }).click();
  await expect(page.getByRole("heading", { name: "我的" })).toBeVisible();
  await expect(page.getByText("还没有投稿记录")).toBeVisible();
});

test("feeling submissions require consent and appear as pending records", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "在现场", exact: true }).click();
  await page.getByRole("button", { name: "分享感受" }).first().click();
  const dialog = page.getByRole("dialog", { name: "分享感受" });
  await dialog.getByLabel("实际拍摄分区").selectOption({ label: "前区" });
  await dialog.getByLabel("现场感受").fill("从前区看舞台很清楚");
  await dialog.getByRole("button", { name: "提交感受" }).click();
  await expect(dialog.getByRole("alert")).toContainText("公开授权");
  await dialog.getByLabel(/我确认内容/).check();
  await dialog.getByRole("button", { name: "提交感受" }).click();
  await expect(page.getByRole("heading", { name: "我的" })).toBeVisible();
  await expect(page.getByText("感受投稿")).toBeVisible();
  await expect(page.getByText("待审核")).toBeVisible();
});

test("entry page matches the hero flow and its actions open the existing sections", async ({ page }, testInfo) => {
  await page.goto("./");
  await expect(page.locator(".landing-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "属于你的现场，从这里看见" })).toBeVisible();
  await expect.poll(() => page.locator(".landing-logo").evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  const heroImage = await page.locator(".landing-shell").evaluate((node) => {
    return getComputedStyle(node, "::before").backgroundImage.match(/url\("([^"]+)"\)/)?.[1];
  });
  expect(heroImage).toBeTruthy();
  const hero = await page.request.get(heroImage!);
  expect(hero.ok()).toBe(true);
  expect(hero.headers()["content-type"]).toContain("image/");
  expect(await page.locator(".landing-shell").evaluate((node) => node.clientHeight)).toBe(await page.evaluate(() => innerHeight));
  await page.screenshot({ path: `test-results/hero-entry-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "进入在现场" }).click();
  await expect(page.locator(".landing-shell")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "在现场" })).toBeVisible();
});
