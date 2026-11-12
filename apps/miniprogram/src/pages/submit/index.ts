import {
  type ContributionInput,
  type Layout,
  type PositionRef,
  validateContribution,
} from "../../../../../packages/contracts";
import {
  loadLayout,
  request,
  login,
  upload,
  errorText,
  newKey,
} from "../../services/api";
type ImageDraft = { path: string; size: number; id?: string; state: string };
let submitKey = newKey();
let alive = true;
Page({
  data: {
    text: "",
    displayName: "热心观众",
    device: "",
    zoom: "",
    shotDate: "",
    scope: 0,
    scopes: ["区域参考", "精确座位"],
    layout: null as Layout | null,
    sections: [] as Layout["sections"],
    sectionIndex: 0,
    row: "",
    seat: "",
    events: [{ id: "", name: "请选择场次" }],
    eventIndex: 0,
    eventProposal: false,
    proposalName: "",
    proposalDate: "",
    images: [] as ImageDraft[],
    tags: [] as string[],
    allTags: ["无遮挡", "栏杆遮挡", "音响遮挡", "屏看得清楚", "距离较远"],
    consent: false,
    busy: false,
    error: "",
    success: false,
  },
  async onLoad() {
    alive = true;
    submitKey = newKey();
    wx.enableAlertBeforeUnload({ message: "尚未提交，离开后本次草稿将丢失" });
    try {
      const [layout, events] = await Promise.all([
        loadLayout(),
        request<Array<{ id: string; name: string }>>("/events?venueId=beijing"),
      ]);
      if (alive)
        this.setData({
          layout,
          sections: layout?.sections ?? [],
          events: [{ id: "", name: "请选择场次" }, ...events],
        });
    } catch (e) {
      if (alive) this.setData({ error: errorText(e) });
    }
  },
  onUnload() {
    alive = false;
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
    submitKey = newKey();
  },
  picker(e: WechatMiniprogram.PickerChange) {
    this.setData({ [e.currentTarget.dataset.field]: Number(e.detail.value) });
    submitKey = newKey();
  },
  proposal() {
    this.setData({ eventProposal: !this.data.eventProposal });
    submitKey = newKey();
  },
  consent(e: WechatMiniprogram.CheckboxGroupChange) {
    this.setData({ consent: e.detail.value.includes("yes") });
    submitKey = newKey();
  },
  tags(e: WechatMiniprogram.CheckboxGroupChange) {
    this.setData({ tags: e.detail.value });
    submitKey = newKey();
  },
  async choose() {
    try {
      const r = await wx.chooseMedia({
        count: 4 - this.data.images.length,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
      });
      const images = r.tempFiles.map((i) => {
        if (i.size > 20 * 1024 * 1024) throw new Error("每张图片最多 20 MB");
        return { path: i.tempFilePath, size: i.size, state: "待上传" };
      });
      this.setData({ images: [...this.data.images, ...images] });
      submitKey = newKey();
    } catch (e) {
      if (e instanceof Error) this.setData({ error: errorText(e) });
    }
  },
  removeImage(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return;
    this.setData({
      images: this.data.images.filter(
        (_, i) => i !== Number(e.currentTarget.dataset.index),
      ),
    });
    submitKey = newKey();
  },
  async submit() {
    if (this.data.busy) return;
    const layout = this.data.layout;
    if (!layout) {
      this.setData({ error: "标准布局尚未发布，暂时不能投稿" });
      return;
    }
    let position: PositionRef = {
      venueId: layout.venueId,
      layoutVersionId: layout.id,
      kind: "venue",
    };
    if (this.data.scope === 0) {
      if (!this.data.sections[this.data.sectionIndex]) return;
      position = {
        ...position,
        kind: "section",
        sectionId: this.data.sections[this.data.sectionIndex].id,
      };
    }
    if (this.data.scope === 1) {
      const sectionId = this.data.sections[this.data.sectionIndex]?.id;
      const seat = layout.seats.find(
        (s) =>
          s.sectionId === sectionId &&
          s.rowLabel === this.data.row.trim() &&
          s.seatLabel === this.data.seat.trim(),
      );
      if (!seat) {
        this.setData({ error: "未找到准确座位，可改为区域或整个场馆" });
        return;
      }
      position = { ...position, kind: "seat", seatId: seat.id };
    }
    if (
      (!this.data.events[this.data.eventIndex].id &&
        (!this.data.eventProposal || !this.data.proposalName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(this.data.proposalDate))) ||
      !this.data.sections[this.data.sectionIndex] ||
      !this.data.consent ||
      (!this.data.text.trim() && !this.data.images.length) ||
      !this.data.displayName.trim()
    ) {
      this.setData({ error: "请填写署名和内容，并主动确认公开授权" });
      return;
    }
    if (!(await login())) return;
    this.setData({ busy: true, error: "" });
    try {
      for (let i = 0; i < this.data.images.length; i++) {
        const image = this.data.images[i];
        if (!image.id) {
          const created = await request<{ id: string }>("/uploads", "POST");
          image.id = created.id;
        }
        if (image.state === "已完成") continue;
        image.state = "上传中";
        this.setData({ images: this.data.images });
        await upload(image.id, image.path);
        let ready = false;
        for (let attempt = 0; attempt < 30 && alive; attempt++) {
          const status = await request<{ state: string }>(
            `/uploads/${image.id}`,
          );
          if (status.state === "ready") {
            ready = true;
            break;
          }
          if (status.state === "failed")
            throw new Error("图片处理失败，请移除后重新选择");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!ready) throw new Error("图片仍在处理中，请稍后重试提交");
        image.state = "已完成";
        this.setData({ images: this.data.images });
      }
      const input: ContributionInput = {
        position,
        text: this.data.text,
        tags: this.data.tags,
        mediaIds: this.data.images.map((i) => i.id!),
        consent: this.data.consent,
        displayName: this.data.displayName,
        ...(this.data.events[this.data.eventIndex].id
          ? { eventId: this.data.events[this.data.eventIndex].id }
          : {}),
        ...(this.data.eventProposal
          ? { eventProposal: { name: this.data.proposalName.trim(), date: this.data.proposalDate } }
          : {}),
        ...(this.data.device ? { device: this.data.device } : {}),
        ...(this.data.zoom ? { zoom: this.data.zoom } : {}),
        ...(this.data.shotDate ? { shotDate: this.data.shotDate } : {}),
      };
      if (!validateContribution(input)) throw new Error("请检查投稿字段与授权");
      await request("/me/contributions", "POST", input, submitKey);
      if (alive) {
        this.setData({ success: true });
        wx.disableAlertBeforeUnload();
      }
    } catch (e) {
      if (alive) this.setData({ error: errorText(e) });
    } finally {
      if (alive) this.setData({ busy: false });
    }
  },
  records() {
    wx.redirectTo({ url: "/pages/records/index?type=contributions" });
  },
});
