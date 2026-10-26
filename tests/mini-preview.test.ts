/// <reference types="miniprogram-api-typings" />
/// <reference path="../apps/miniprogram/src/types.d.ts" />
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { demoLayout } from "../fixtures/beijing-demo";

const mocks = vi.hoisted(() => ({
  loadLayout: vi.fn(),
  createRenderer: vi.fn(),
  dispose: vi.fn(),
  query: vi.fn(),
  store: {
    setLayout: vi.fn(),
    visit: vi.fn(),
    local: { favorites: [] },
    favorite: vi.fn(),
  },
}));
vi.mock("three-platformize", () => ({
  PLATFORM: { set: vi.fn(), dispose: mocks.dispose },
}));
vi.mock("three-platformize/src/WechatPlatform", () => ({
  WechatPlatform: class {},
}));
vi.mock("../packages/venue-renderer", () => ({
  createVenueRenderer: mocks.createRenderer,
}));
vi.mock("../apps/miniprogram/src/services/api", () => ({
  loadLayout: mocks.loadLayout,
  errorText: (e: Error) => e.message,
  apiBase: "http://127.0.0.1:3000/api/v1",
}));
vi.mock("../apps/miniprogram/src/services/store", () => ({
  store: mocks.store,
  chooseCompare: vi.fn(),
}));
type PageInstance = Record<string, any>;
let definition: PageInstance;
const layout = demoLayout();
const position = {
  venueId: layout.venueId,
  layoutVersionId: layout.id,
  kind: "seat",
  seatId: layout.seats[0].id,
};
const options = { position: encodeURIComponent(JSON.stringify(position)) };
function page(): PageInstance {
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(update: object) {
      Object.assign(this.data, update);
    },
  };
}
function scene() {
  return {
    select: vi.fn(),
    destroy: vi.fn(),
    look: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    overview: vi.fn(),
  };
}
beforeAll(async () => {
  vi.stubGlobal("Page", (value: PageInstance) => (definition = value));
  vi.stubGlobal("wx", {
    nextTick: (callback: () => void) => callback(),
    getWindowInfo: () => ({ pixelRatio: 1 }),
    createSelectorQuery: () => {
      const query = {
        in: () => query,
        select: () => query,
        fields: () => query,
        exec: (callback: Function) => {
          mocks.query();
          callback([{ node: {}, width: 320, height: 400 }]);
        },
      };
      return query;
    },
  });
  await import("../apps/miniprogram/src/subpackages/venue/preview/index");
});
afterAll(() => vi.unstubAllGlobals());
describe("native preview lifecycle", () => {
  it("restores the earlier page after a second preview is unloaded", async () => {
    mocks.loadLayout.mockResolvedValue(layout);
    const first = scene(),
      second = scene(),
      restored = scene();
    mocks.createRenderer
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
      .mockReturnValueOnce(restored);
    const a = page(),
      b = page();
    await a.onLoad(options);
    a.onHide();
    expect(first.destroy).toHaveBeenCalledOnce();
    await b.onLoad(options);
    b.onHide();
    b.onUnload();
    expect(second.destroy).toHaveBeenCalledOnce();
    a.onShow();
    a.reset();
    expect(restored.select).toHaveBeenCalledWith(position, false);
    expect(restored.reset).toHaveBeenCalledOnce();
    expect(restored.destroy).not.toHaveBeenCalled();
    a.onUnload();
    expect(restored.destroy).toHaveBeenCalledOnce();
  });
  it("does not initialize a hidden page after asynchronous layout loading", async () => {
    let complete!: (value: typeof layout) => void;
    mocks.loadLayout.mockReturnValueOnce(
      new Promise((resolve) => (complete = resolve)),
    );
    const a = page(),
      before = mocks.createRenderer.mock.calls.length;
    const loading = a.onLoad(options);
    a.onHide();
    complete(layout);
    await loading;
    expect(mocks.createRenderer.mock.calls.length).toBe(before);
    const restored = scene();
    mocks.createRenderer.mockReturnValueOnce(restored);
    a.onShow();
    expect(restored.select).toHaveBeenCalledWith(position, false);
    a.onUnload();
  });
  it("ignores a layout response after unload", async () => {
    let complete!: (value: typeof layout) => void;
    mocks.loadLayout.mockReturnValueOnce(
      new Promise((resolve) => (complete = resolve)),
    );
    const a = page(),
      before = mocks.createRenderer.mock.calls.length;
    const loading = a.onLoad(options);
    a.onUnload();
    complete(layout);
    await loading;
    expect(a.data.position).toBeNull();
    expect(mocks.createRenderer.mock.calls.length).toBe(before);
  });
});
