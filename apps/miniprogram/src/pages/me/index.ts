import {
  login,
  loggedIn,
  request,
  logout,
  errorText,
} from "../../services/api";
import { store } from "../../services/store";
Page({
  data: {
    loggedIn: false,
    name: "现场的你",
    favorites: 0,
    recent: 0,
    error: "",
  },
  async onShow() {
    this.setData({
      loggedIn: loggedIn(),
      favorites: store.local.favorites.length,
      recent: store.local.recent.length,
    });
    if (loggedIn())
      try {
        const u = await request<{ displayName: string }>("/me");
        this.setData({ name: u.displayName });
      } catch (e) {
        this.setData({ loggedIn: loggedIn(), error: errorText(e) });
      }
  },
  async login() {
    if (await login()) {
      await this.onShow();
      const r = await wx.showModal({
        title: "同步本机收藏",
        content: "是否将当前本机收藏导入此账号？",
        confirmText: "导入",
      });
      if (r.confirm)
        try {
          for (const position of store.local.favorites)
            await request("/me/favorites", "PUT", { position, enabled: true });
          wx.showToast({ title: "同步完成" });
        } catch (e) {
          wx.showToast({ title: errorText(e), icon: "none" });
        }
    }
  },
  open(e: WechatMiniprogram.TouchEvent) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },
  async logout() {
    try {
      await logout();
    } catch {
      /* Local identity must still be cleared when offline. */
    }
    this.setData({ loggedIn: false, name: "现场的你" });
  },
  async profile(e: WechatMiniprogram.Input) {
    if (!loggedIn()) return;
    try {
      const u = await request<{ displayName: string }>("/me", "PUT", {
        displayName: e.detail.value,
      });
      this.setData({ name: u.displayName });
    } catch (err) {
      wx.showToast({ title: errorText(err), icon: "none" });
    }
  },
});
