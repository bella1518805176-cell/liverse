import { request, login, errorText, apiBase } from "../../services/api";
import type { PublicContent } from "../../../../../packages/contracts";
import { sharePath } from "../../../../../packages/venue-core";
Page({
  data: {
    content: null as PublicContent | null,
    images: [] as string[],
    error: "",
    loading: true,
    helpful: false,
  },
  async onLoad(o: Record<string, string>) {
    try {
      const content = await request<PublicContent>(
        `/contributions/${encodeURIComponent(o.id)}`,
      );
      this.setData({
        content,
        images: content.mediaIds.map((id) => `${apiBase}/media/${id}`),
      });
    } catch (e) {
      this.setData({ error: errorText(e) });
    } finally {
      this.setData({ loading: false });
    }
  },
  preview(e: WechatMiniprogram.TouchEvent) {
    wx.previewImage({
      urls: this.data.images,
      current: e.currentTarget.dataset.url,
    });
  },
  position() {
    if (this.data.content)
      wx.navigateTo({ url: sharePath(this.data.content.position) });
  },
  async helpful() {
    if (!this.data.content || !(await login())) return;
    const enabled = !this.data.helpful;
    try {
      await request(`/contributions/${this.data.content.id}/helpful`, "PUT", {
        enabled,
      });
      this.setData({ helpful: enabled });
    } catch (e) {
      wx.showToast({ title: errorText(e), icon: "none" });
    }
  },
  report() {
    if (this.data.content)
      wx.navigateTo({
        url: `/pages/tickets/index?target=${this.data.content.id}`,
      });
  },
  onShareAppMessage() {
    return {
      title: "LIVERSE · 现场分享",
      path: this.data.content
        ? `/pages/content/index?id=${this.data.content.id}`
        : "/pages/home/index",
    };
  },
});
