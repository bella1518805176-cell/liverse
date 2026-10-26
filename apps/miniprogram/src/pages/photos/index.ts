import { request, loadLayout, errorText, apiBase } from "../../services/api";
import type { PublicContent } from "../../../../../packages/contracts";
Page({
  data: {
    items: [] as Array<PublicContent & { image: string }>,
    events: [{ id: "", name: "全部场次" }],
    sections: [{ id: "", name: "全部区域" }],
    eventIndex: 0,
    sectionIndex: 0,
    kind: "all",
    loading: false,
    error: "",
    nextCursor: null as string | null,
  },
  async onLoad() {
    try {
      const [events, layout] = await Promise.all([
        request<Array<{ id: string; name: string }>>("/events?venueId=beijing"),
        loadLayout(),
      ]);
      this.setData({
        events: [{ id: "", name: "全部场次" }, ...events],
        sections: [{ id: "", name: "全部区域" }, ...(layout?.sections ?? [])],
      });
    } catch (e) {
      this.setData({ error: errorText(e) });
    }
    await this.load();
  },
  async load(append = false) {
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const q = `venueId=beijing&eventId=${this.data.events[this.data.eventIndex].id}&sectionId=${this.data.sections[this.data.sectionIndex].id}&kind=${this.data.kind}${append && this.data.nextCursor ? `&cursor=${this.data.nextCursor}` : ""}`;
      const result = await request<{
        items: PublicContent[];
        nextCursor: string | null;
      }>(`/contributions?${q}`);
      this.setData({
        items: [
          ...(append ? this.data.items : []),
          ...result.items.map((i) => ({
            ...i,
            image: i.mediaIds[0] ? `${apiBase}/media/${i.mediaIds[0]}` : "",
          })),
        ],
        nextCursor: result.nextCursor,
      });
    } catch (e) {
      this.setData({ error: errorText(e) });
    } finally {
      this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
  more() {
    void this.load(true);
  },
  eventChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ eventIndex: Number(e.detail.value) });
    void this.load();
  },
  sectionChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ sectionIndex: Number(e.detail.value) });
    void this.load();
  },
  kind(e: WechatMiniprogram.TouchEvent) {
    this.setData({ kind: e.currentTarget.dataset.kind });
    void this.load();
  },
  detail(e: WechatMiniprogram.TouchEvent) {
    wx.navigateTo({
      url: `/pages/content/index?id=${e.currentTarget.dataset.id}`,
    });
  },
  submit() {
    wx.navigateTo({ url: "/pages/submit/index" });
  },
  home() {
    wx.switchTab({ url: "/pages/home/index" });
  },
});
