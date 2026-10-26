import { request, login, errorText, newKey } from "../../services/api";
import { store } from "../../services/store";
Page({
  data: { error: "", contact: "", development: __DEVELOPMENT__ },
  async onLoad() {
    try {
      this.setData(await request<{ contactEmail: string }>("/config"));
    } catch {}
  },
  async clear() {
    if (
      (
        await wx.showModal({
          title: "清理本机记录",
          content: "将删除此设备的本机收藏、最近浏览与地图状态。",
        })
      ).confirm
    ) {
      store.clear();
      wx.showToast({ title: "本机记录已清理" });
    }
  },
  async deletion() {
    if (!(await login())) return;
    if (
      !(
        await wx.showModal({
          title: "申请删除账号数据",
          content:
            "申请将由运营处理，公开内容及备份的处理规则以正式隐私政策为准。提交后可在反馈进度中跟踪。",
          confirmText: "确认申请",
        })
      ).confirm
    )
      return;
    try {
      await request(
        "/me/tickets",
        "POST",
        {
          category: "account-deletion",
          text: "申请删除本人账号及关联个人数据，等待运营核实并告知处理范围与期限。",
        },
        newKey(),
      );
      wx.navigateTo({ url: "/pages/tickets/index" });
    } catch (e) {
      this.setData({ error: errorText(e) });
    }
  },
});
