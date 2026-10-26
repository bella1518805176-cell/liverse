import { request, login, errorText, newKey } from "../../services/api";
import type { Ticket } from "../../../../../packages/contracts";
let ticketKey = newKey();
Page({
  data: {
    target: "",
    category: 0,
    categories: ["一般反馈", "位置错误", "内容问题", "隐私问题", "版权问题"],
    codes: ["feedback", "position", "content", "privacy", "copyright"],
    text: "",
    items: [] as Ticket[],
    error: "",
    busy: false,
    contact: "",
  },
  async onLoad(o: Record<string, string>) {
    ticketKey = newKey();
    this.setData({ target: o.target ?? "", category: o.target ? 2 : 0 });
    try {
      const c = await request<{ contactEmail: string }>("/config");
      this.setData({ contact: c.contactEmail });
    } catch {}
    await this.load();
  },
  async load() {
    if (!(await login())) return;
    try {
      this.setData({ items: await request<Ticket[]>("/me/tickets") });
    } catch (e) {
      this.setData({ error: errorText(e) });
    }
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ text: e.detail.value });
    ticketKey = newKey();
  },
  category(e: WechatMiniprogram.PickerChange) {
    this.setData({ category: Number(e.detail.value) });
    ticketKey = newKey();
  },
  async submit() {
    if (this.data.busy || !(await login())) return;
    this.setData({ busy: true, error: "" });
    try {
      const confirmation = await wx.showModal({
        title: "提交问题",
        content: "确认以当前登录账号提交并跟踪此问题？",
      });
      if (!confirmation.confirm) return;
      await request(
        "/me/tickets",
        "POST",
        {
          category: this.data.codes[this.data.category],
          text: this.data.text,
          ...(this.data.target ? { targetId: this.data.target } : {}),
        },
        ticketKey,
      );
      this.setData({ text: "", target: "" });
      ticketKey = newKey();
      await this.load();
      wx.showToast({ title: "已收到反馈" });
    } catch (e) {
      this.setData({ error: errorText(e) });
    } finally {
      this.setData({ busy: false });
    }
  },
  contact() {
    wx.setClipboardData({ data: this.data.contact });
  },
});
