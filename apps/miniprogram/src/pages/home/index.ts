import { loadLayout, errorText, apiBase } from "../../services/api";
import { store } from "../../services/store";
import { positionLabel, sharePath } from "../../../../../packages/venue-core";
Page({
  data: {
    loading: true,
    error: "",
    layout: null as unknown,
    development: __DEVELOPMENT__,
    image: `${apiBase.replace("/api/v1", "")}/assets/beijing-live.jpg`,
    recent: [] as { label: string; path: string }[],
  },
  async onShow() {
    await this.load();
  },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const layout = await loadLayout();
      if (layout) store.setLayout(layout);
      this.setData({
        layout,
        recent: layout
          ? store.local.recent
              .filter((p) => p.layoutVersionId === layout.id)
              .map((p) => ({
                label: positionLabel(layout, p),
                path: sharePath(p),
              }))
          : [],
      });
    } catch (e) {
      this.setData({ error: errorText(e) });
    } finally {
      this.setData({ loading: false });
    }
  },
  openMap() {
    wx.navigateTo({ url: "/subpackages/venue/map/index" });
  },
  openRecent(e: WechatMiniprogram.TouchEvent) {
    wx.navigateTo({ url: e.currentTarget.dataset.path });
  },
  photos() {
    wx.switchTab({ url: "/pages/photos/index" });
  },
  onShareAppMessage() {
    return { title: "北京 LIVERSE · 观演视野", path: "/pages/home/index" };
  },
});
