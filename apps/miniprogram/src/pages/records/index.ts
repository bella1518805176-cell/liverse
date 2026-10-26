import { loadLayout, request, login, errorText } from "../../services/api";
import { store } from "../../services/store";
import { positionLabel, sharePath } from "../../../../../packages/venue-core";
import type { PositionRef } from "../../../../../packages/contracts";
Page({
  data: {
    type: "favorites",
    title: "",
    items: [] as {
      id: string;
      label: string;
      path: string;
      state?: string;
      reason?: string;
      position?: PositionRef;
    }[],
    error: "",
    loading: true,
  },
  async onLoad(o: Record<string, string>) {
    this.setData({
      type: o.type ?? "favorites",
      title:
        (
          {
            favorites: "本机收藏",
            recent: "最近浏览",
            cloud: "云端收藏",
            contributions: "我的投稿",
          } as Record<string, string>
        )[o.type] ?? "记录",
    });
    await this.load();
  },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const type = this.data.type;
      if (type === "contributions") {
        if (!(await login())) return;
        const rows =
          await request<
            Array<{ id: string; text: string; state: string; reason: string }>
          >("/me/contributions");
        this.setData({
          items: rows.map((r) => ({
            id: r.id,
            label: r.text || "图片投稿",
            path:
              r.state === "published" ? `/pages/content/index?id=${r.id}` : "",
            state: (
              {
                pending: "待审核",
                published: "已公开",
                rejected: "未通过",
                withdrawn: "已下架",
                deleted: "已删除",
              } as Record<string, string>
            )[r.state],
            reason: r.reason,
          })),
        });
      } else {
        let refs: PositionRef[];
        if (type === "cloud") {
          if (!(await login())) return;
          const rows =
            await request<Array<{ position: PositionRef }>>("/me/favorites");
          refs = rows.map((r) => r.position);
        } else
          refs = type === "recent" ? store.local.recent : store.local.favorites;
        const items = await Promise.all(
          refs.map(async (p, i) => {
            try {
              const l = await loadLayout(p.layoutVersionId);
              return {
                id: String(i),
                label: l ? positionLabel(l, p) : "布局不可用",
                path: l ? sharePath(p) : "",
                position: p,
              };
            } catch {
              return {
                id: String(i),
                label: "布局已下架或暂不可用",
                path: "",
                position: p,
              };
            }
          }),
        );
        this.setData({ items });
      }
    } catch (e) {
      this.setData({ error: errorText(e) });
    } finally {
      this.setData({ loading: false });
    }
  },
  open(e: WechatMiniprogram.TouchEvent) {
    const item = this.data.items[Number(e.currentTarget.dataset.index)];
    if (item.path) wx.navigateTo({ url: item.path });
  },
  async remove(e: WechatMiniprogram.TouchEvent) {
    const item = this.data.items[Number(e.currentTarget.dataset.index)];
    if (
      !(
        await wx.showModal({
          title: "确认删除",
          content:
            this.data.type === "contributions"
              ? "删除后内容将停止公开，不能撤销。"
              : "从收藏中移除此位置？",
        })
      ).confirm
    )
      return;
    try {
      if (this.data.type === "contributions")
        await request(`/me/contributions/${item.id}`, "DELETE");
      else if (this.data.type === "cloud")
        await request("/me/favorites", "PUT", {
          position: item.position,
          enabled: false,
        });
      else if (item.position) store.favorite(item.position);
      await this.load();
    } catch (e) {
      this.setData({ error: errorText(e) });
    }
  },
});
