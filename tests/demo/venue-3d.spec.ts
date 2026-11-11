import { test, expect, type Locator } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import placement from "../../docs/data/shanghai-3d-placement-estimate.json" with { type: "json" };

async function projection(canvas: Locator, position: number[]) {
  const pose = await canvas.evaluate((c: HTMLCanvasElement) => ({ position: c.dataset.cameraPosition!, quaternion: c.dataset.cameraQuaternion!, fov: Number(c.dataset.cameraFov), width: c.clientWidth, height: c.clientHeight }));
  const camera = new PerspectiveCamera(pose.fov, pose.width / pose.height, 0.06, 250);
  camera.position.fromArray(pose.position.split(",").map(Number));
  camera.quaternion.fromArray(pose.quaternion.split(",").map(Number)); camera.updateMatrixWorld();
  const point = new Vector3(position[0], position[1] + 0.45, position[2]).project(camera);
  return { x: (point.x + 1) / 2 * pose.width, y: (1 - point.y) / 2 * pose.height };
}

test("3D renders the 1208-seat model, picks actual chairs and preserves 2D / audience identity", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("./");
  expect(requests.some((r) => /Venue3D-.*\.js/.test(r))).toBe(false);
  await page.getByRole("button", { name: "3D 视图", exact: true }).click();
  const canvas = page.locator(".venue-canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await expect(canvas).toHaveAttribute("data-seat-count", "1208");
  await expect(canvas).toHaveAttribute("data-visible-seat-count", "1208");
  await expect(page.locator(".model-note")).toContainText("阶高 495 / 进深 900mm");
  await page.screenshot({ path: `output/verification/shanghai-3d-overview-${testInfo.project.name}.png`, fullPage: true });

  const initial = await canvas.getAttribute("data-camera-position");
  await canvas.focus(); await page.keyboard.press("ArrowLeft");
  await expect(canvas).not.toHaveAttribute("data-camera-position", initial!);
  await page.getByRole("button", { name: "3D复位", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-camera-position", initial!);
  await page.getByRole("button", { name: "3D放大", exact: true }).click();
  await expect(canvas).not.toHaveAttribute("data-camera-position", initial!);

  for (const [floor, count, row, number] of [["1F", 800, 1, 20], ["2F", 408, 5, 20]] as const) {
    await page.getByRole("button", { name: `仅看 ${floor}`, exact: true }).click();
    await expect(canvas).toHaveAttribute("data-visible-seat-count", String(count));
    await page.getByRole("button", { name: "3D俯视", exact: true }).click();
    await expect.poll(() => canvas.getAttribute("data-camera-position")).not.toBe(initial);
    // Project an exported seat coordinate into the current camera, then click its real mesh.
    const seat = placement.seats.find((s) => s.floor === floor && s.row === row && s.number === number)!;
    await expect.poll(async () => {
      const p = await projection(canvas, seat.position_m);
      return p.x > 0 && p.y > 120 && p.x < (await canvas.boundingBox())!.width;
    }).toBe(true);
    await canvas.click({ position: await projection(canvas, seat.position_m) });
    await expect(canvas).toHaveAttribute("data-selected-id", seat.id);
    await expect(page.locator(".selection-copy strong")).toContainText(`${row}排${number}号`);
    await page.getByRole("button", { name: "从这里看舞台", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-camera-mode", "观众视角");
    const eye = (await canvas.getAttribute("data-camera-position"))!.split(",").map(Number);
    expect(eye[0]).toBeCloseTo(seat.position_m[0], 5);
    expect(eye[1]).toBeCloseTo(seat.position_m[1] + 1.2, 5);
    expect(eye[2]).toBeCloseTo(seat.position_m[2] - 0.06, 5);
    await page.screenshot({ path: `output/verification/shanghai-3d-audience-${floor}-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: /手机取景/ }).click();
    await expect(page.locator(".viewfinder")).toBeVisible();
    await page.getByRole("button", { name: "2×", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-camera-fov", "32");
    await page.getByRole("button", { name: "1×", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-camera-fov", "60");
    await page.getByRole("button", { name: "回到 2D 座位图", exact: true }).click();
    await expect(page.locator(".seat.selected")).toHaveAttribute("aria-label", `${floor}${floor === "1F" ? "前区" : "固定坐席"} ${row}排${number}号`);
    await page.getByRole("button", { name: "3D 视图", exact: true }).click();
    await page.getByRole("button", { name: /场馆总览/ }).click();
    await expect(canvas).toHaveAttribute("data-ready", "true");
    await expect(canvas).toHaveAttribute("data-camera-mode", "场馆总览");
  }
  await page.getByRole("button", { name: "全馆", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-visible-seat-count", "1208");
  await page.getByRole("button", { name: "清除选择", exact: true }).click();
  await page.getByRole("button", { name: /观众视角/ }).click();
  await expect(page.getByText("先选择一个观演位置")).toBeVisible();
  await page.locator(".scene-empty").getByRole("button", { name: "选择位置", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "选择位置" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("3D reports context loss and can reload without blocking 2D", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "3D 视图", exact: true }).click();
  await expect(page.locator(".venue-canvas")).toHaveAttribute("data-ready", "true");
  await page.locator(".venue-canvas").evaluate((canvas) => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  await expect(page.getByRole("alert")).toContainText("3D 暂时无法显示");
  await page.getByRole("button", { name: "重新加载3D", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".venue-canvas")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "回到 2D 座位图", exact: true }).click();
  await expect(page.locator(".seat")).toHaveCount(800);
});
