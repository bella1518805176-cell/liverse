import {
  positionLabel,
  sharePath,
} from "../../../../../../packages/venue-core";
import { store } from "../../../services/store";
Page({
  data: { items: [] as { label: string; path: string }[], active: 0 },
  onShow() {
    const layout = store.layout;
    this.setData({
      items: layout
        ? store.compare.map((p) => ({
            label: positionLabel(layout, p),
            path: sharePath(p),
          }))
        : [],
    });
  },
  select(e: WechatMiniprogram.TouchEvent) {
    this.setData({ active: Number(e.currentTarget.dataset.index) });
  },
  open() {
    if (this.data.items[this.data.active])
      wx.navigateTo({ url: this.data.items[this.data.active].path });
  },
  remove(e: WechatMiniprogram.TouchEvent) {
    store.removeCompare(Number(e.currentTarget.dataset.index));
    this.setData({ active: 0 });
    this.onShow();
  },
  map() {
    wx.navigateTo({ url: "/subpackages/venue/map/index" });
  },
});
