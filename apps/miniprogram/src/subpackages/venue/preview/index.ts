import * as THREE from "three-platformize";
import { WechatPlatform } from "three-platformize/src/WechatPlatform";
import {
  createVenueRenderer,
  type RendererPlatform,
} from "../../../../../../packages/venue-renderer";
import {
  type PositionRef,
  type Layout,
  validatePosition,
  positionKey,
} from "../../../../../../packages/contracts";
import {
  positionLabel,
  sharePath,
  resolvePosition,
} from "../../../../../../packages/venue-core";
import { loadLayout, errorText, apiBase } from "../../../services/api";
import { store, chooseCompare } from "../../../services/store";
type Runtime = {
  renderer: ReturnType<typeof createVenueRenderer> | null;
  alive: boolean;
  visible: boolean;
  generation: number;
  layout: Layout | null;
  lastTouch: { x: number; y: number } | null;
  canvasNode: WechatMiniprogram.Canvas | null;
};
const runtimes = new WeakMap<object, Runtime>();
function runtime(page: object): Runtime {
  let value = runtimes.get(page);
  if (!value) {
    value = {
      renderer: null,
      alive: true,
      visible: true,
      generation: 0,
      layout: null,
      lastTouch: null,
      canvasNode: null,
    };
    runtimes.set(page, value);
  }
  return value;
}
function destroyScene(page: object) {
  const state = runtime(page);
  state.generation++;
  if (state.renderer) {
    state.renderer.destroy();
    THREE.PLATFORM.dispose();
  }
  state.renderer = null;
  state.canvasNode = null;
  state.lastTouch = null;
}
Page({
  data: {
    loading: true,
    error: "",
    renderError: "",
    label: "",
    position: null as PositionRef | null,
    source: "",
    version: "",
    demo: false,
    canModel: false,
    standing: false,
    mode: "model",
    favorite: false,
    referenceImage: "",
    showReference: false,
  },
  async onLoad(options: Record<string, string>) {
    const state = runtime(this);
    try {
      const p: unknown = JSON.parse(decodeURIComponent(options.position ?? ""));
      if (!validatePosition(p)) throw new Error("分享位置无效");
      const layout = await loadLayout(p.layoutVersionId);
      if (!layout) throw new Error("布局尚未发布");
      resolvePosition(layout, p);
      if (!state.alive) return;
      state.layout = layout;
      store.setLayout(layout);
      store.visit(p);
      this.setData({
        loading: false,
        position: p,
        label: positionLabel(layout, p),
        source: layout.source,
        version: layout.name,
        demo: layout.demo,
        canModel: layout.capabilities.model && layout.demo,
        favorite: store.local.favorites.some(
          (item) => positionKey(item) === positionKey(p),
        ),
        referenceImage: layout.demo
          ? `${apiBase.replace("/api/v1", "")}/assets/beijing-stage.jpg`
          : "",
        mode: layout.capabilities.model && layout.demo ? "model" : "reference",
      });
      if (this.data.canModel) wx.nextTick(() => this.initRenderer());
    } catch (e) {
      if (state.alive) this.setData({ loading: false, error: errorText(e) });
    }
  },
  initRenderer() {
    const state = runtime(this);
    if (!state.alive || !state.visible) return;
    destroyScene(this);
    const generation = state.generation;
    this.setData({ renderError: "" });
    wx.createSelectorQuery()
      .in(this)
      .select("#scene")
      .fields({ node: true, size: true })
      .exec(
        (
          result: Array<{
            node: WechatMiniprogram.Canvas;
            width: number;
            height: number;
          }>,
        ) => {
          if (
            !state.alive ||
            !state.visible ||
            generation !== state.generation ||
            !result[0]?.node ||
            !state.layout ||
            !this.data.position
          )
            return;
          try {
            const { node, width, height } = result[0];
            state.canvasNode = node;
            THREE.PLATFORM.set(new WechatPlatform(node, width, height));
            const platform = {
              canvas: node as unknown as HTMLCanvasElement,
              width,
              height,
              dpr: wx.getWindowInfo().pixelRatio,
              requestFrame: (cb: FrameRequestCallback) =>
                node.requestAnimationFrame(cb),
              cancelFrame: (id: number) => node.cancelAnimationFrame(id),
            } satisfies RendererPlatform;
            state.renderer = createVenueRenderer(THREE, platform, state.layout);
            state.renderer.select(this.data.position, this.data.standing);
          } catch {
            this.setData({
              renderError: "当前设备无法打开 3D，可重试或返回地图。",
            });
          }
        },
      );
  },
  onHide() {
    runtime(this).visible = false;
    destroyScene(this);
  },
  onShow() {
    runtime(this).visible = true;
    if (this.data.canModel && this.data.mode === "model")
      wx.nextTick(() => this.initRenderer());
    if (this.data.position)
      this.setData({
        favorite: store.local.favorites.some(
          (p) => positionKey(p) === positionKey(this.data.position!),
        ),
      });
  },
  onUnload() {
    runtime(this).alive = false;
    destroyScene(this);
  },
  contextLost() {
    runtime(this).renderer?.pause();
    this.setData({ renderError: "3D 场景已中断，选择重试可恢复当前位置。" });
  },
  start(e: WechatMiniprogram.TouchCanvas) {
    runtime(this).lastTouch = e.touches[0];
  },
  move(e: WechatMiniprogram.TouchCanvas) {
    const t = e.touches[0];
    const state = runtime(this);
    if (state.lastTouch)
      state.renderer?.look(t.x - state.lastTouch.x, t.y - state.lastTouch.y);
    state.lastTouch = t;
  },
  end() {
    runtime(this).lastTouch = null;
  },
  stance(e: WechatMiniprogram.SwitchChange) {
    this.setData({ standing: e.detail.value });
    if (this.data.position)
      runtime(this).renderer?.select(this.data.position, e.detail.value);
  },
  reset() {
    runtime(this).renderer?.reset();
  },
  overview() {
    runtime(this).renderer?.overview();
  },
  retry() {
    this.initRenderer();
  },
  reference() {
    destroyScene(this);
    this.setData({ mode: "reference" });
  },
  model() {
    this.setData({ mode: "model" });
    wx.nextTick(() => this.initRenderer());
  },
  favorite() {
    if (this.data.position) {
      store.favorite(this.data.position);
      this.setData({ favorite: !this.data.favorite });
    }
  },
  async compare() {
    if (this.data.position)
      try {
        await chooseCompare(this.data.position);
        wx.navigateTo({ url: "/subpackages/venue/compare/index" });
      } catch (e) {
        wx.showToast({ title: errorText(e), icon: "none" });
      }
  },
  map() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: "/subpackages/venue/map/index" }),
    });
  },
  photos() {
    wx.switchTab({ url: "/pages/photos/index" });
  },
  screenshot() {
    const canvasNode = runtime(this).canvasNode;
    if (!canvasNode) return;
    wx.canvasToTempFilePath({
      canvas: canvasNode,
      success: (r) => wx.previewImage({ urls: [r.tempFilePath] }),
      fail: () => wx.showToast({ title: "截图失败，请重试", icon: "none" }),
    });
  },
  onShareAppMessage() {
    return {
      title: `${this.data.demo ? "开发示例 · " : ""}LIVERSE · ${this.data.label}`,
      path: this.data.position
        ? sharePath(this.data.position)
        : "/pages/home/index",
    };
  },
});
