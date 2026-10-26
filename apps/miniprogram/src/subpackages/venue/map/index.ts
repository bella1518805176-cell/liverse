import {
  type Layout,
  type PositionRef,
} from "../../../../../../packages/contracts";
import {
  buildSeatIndex,
  fitMap,
  project,
  unproject,
  searchSeat,
  positionLabel,
  sharePath,
  type MapTransform,
} from "../../../../../../packages/venue-core";
import { loadLayout, errorText } from "../../../services/api";
import { store, chooseCompare } from "../../../services/store";
let canvas: WechatMiniprogram.Canvas | null = null,
  ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D | null =
    null,
  layout: Layout | null = null;
let transform: MapTransform = { scale: 8, offsetX: 180, offsetY: 40 },
  hit: ReturnType<typeof buildSeatIndex> | null = null;
let gesture: { x: number; y: number; moved: boolean; distance: number } | null =
    null,
  width = 350,
  height = 400;
Page({
  data: {
    loading: true,
    error: "",
    floor: "",
    floors: [] as string[],
    sections: [] as Layout["sections"],
    sectionIndex: 0,
    row: "",
    seat: "",
    selected: null as PositionRef | null,
    selectedLabel: "",
    source: "",
    version: "",
    demo: false,
    hasSeats: false,
    zoom: "1.0",
    compareCount: 0,
  },
  async onLoad(options: Record<string, string>) {
    try {
      layout = await loadLayout(options.layout);
      if (!layout) {
        this.setData({ loading: false, error: "场馆布局尚未发布" });
        return;
      }
      store.setLayout(layout);
      hit = buildSeatIndex(layout.seats);
      const saved = store.local.map;
      const floor =
        saved && layout.floors.includes(saved.floor)
          ? saved.floor
          : layout.floors[0];
      this.setData({
        floor,
        floors: layout.floors,
        sections: layout.sections.filter((s) => s.floor === floor),
        source: layout.source,
        version: layout.name,
        demo: layout.demo,
        hasSeats: layout.capabilities.seats,
        loading: false,
      });
      if (saved?.selected?.layoutVersionId === layout.id)
        this.select(saved.selected);
      wx.nextTick(() => this.initCanvas());
    } catch (e) {
      this.setData({ loading: false, error: errorText(e) });
    }
  },
  onShow() {
    this.setData({ compareCount: store.compare.length });
  },
  onUnload() {
    this.persist();
    canvas = null;
    ctx = null;
    layout = null;
    hit = null;
  },
  persist() {
    store.map({
      floor: this.data.floor,
      ...transform,
      selected: this.data.selected ?? undefined,
    });
  },
  initCanvas() {
    wx.createSelectorQuery()
      .in(this)
      .select("#map")
      .fields({ node: true, size: true })
      .exec(
        (
          res: Array<{
            node: WechatMiniprogram.Canvas;
            width: number;
            height: number;
          }>,
        ) => {
          if (!res[0]?.node) return;
          canvas = res[0].node;
          width = res[0].width;
          height = res[0].height;
          const dpr = Math.min(wx.getWindowInfo().pixelRatio, 2);
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx = canvas.getContext("2d");
          ctx!.scale(dpr, dpr);
          const saved = store.local.map;
          transform =
            saved && saved.selected?.layoutVersionId === layout?.id
              ? {
                  scale: saved.scale,
                  offsetX: saved.offsetX,
                  offsetY: saved.offsetY,
                }
              : fitMap(width, height);
          this.draw();
        },
      );
  },
  draw() {
    if (!ctx || !layout) return;
    const c = ctx;
    c.clearRect(0, 0, width, height);
    c.fillStyle = "#11161b";
    c.fillRect(0, 0, width, height);
    const stage = project(-12, -1, transform);
    c.fillStyle = "#ff5018";
    c.fillRect(stage.x, stage.y, 24 * transform.scale, 3.5 * transform.scale);
    c.fillStyle = "#ffffff";
    c.font = "bold 13px sans-serif";
    c.textAlign = "center";
    c.fillText(
      "STAGE / 舞台",
      transform.offsetX,
      stage.y + 2.1 * transform.scale,
    );
    for (const section of layout.sections.filter(
      (s) => s.floor === this.data.floor,
    )) {
      const p = project(
        section.x - section.width / 2,
        section.z - section.depth / 2,
        transform,
      );
      c.strokeStyle = "#52606b";
      c.lineWidth = 1;
      c.strokeRect(
        p.x,
        p.y,
        section.width * transform.scale,
        section.depth * transform.scale,
      );
      if (!layout.capabilities.seats) {
        c.fillStyle = "#c8d0d7";
        c.fillText(
          section.name,
          project(section.x, section.z, transform).x,
          project(section.x, section.z, transform).y,
        );
      }
    }
    for (const seat of layout.seats) {
      if (seat.floor !== this.data.floor) continue;
      const p = project(seat.x, seat.z, transform);
      if (p.x < -10 || p.y < -10 || p.x > width + 10 || p.y > height + 10)
        continue;
      const selected = this.data.selected;
      c.fillStyle =
        selected?.kind === "seat" && selected.seatId === seat.id
          ? "#ff5018"
          : "#94a1ad";
      const size = Math.max(2, Math.min(11, transform.scale * 0.72));
      c.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    this.setData({
      zoom: (transform.scale / fitMap(width, height).scale).toFixed(1),
    });
  },
  select(p: PositionRef) {
    if (!layout) return;
    this.setData({ selected: p, selectedLabel: positionLabel(layout, p) });
    this.draw();
    this.persist();
  },
  floor(e: WechatMiniprogram.TouchEvent) {
    const floor = e.currentTarget.dataset.floor;
    this.setData({
      floor,
      sections: layout!.sections.filter((s) => s.floor === floor),
      sectionIndex: 0,
      selected: null,
      selectedLabel: "",
    });
    this.draw();
    this.persist();
  },
  section(e: WechatMiniprogram.PickerChange) {
    const i = Number(e.detail.value);
    this.setData({ sectionIndex: i });
    if (layout && !layout.capabilities.seats)
      this.select({
        venueId: layout.venueId,
        layoutVersionId: layout.id,
        kind: "section",
        sectionId: this.data.sections[i].id,
      });
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },
  search() {
    if (!layout) return;
    const seat = searchSeat(
      layout,
      this.data.floor,
      this.data.sections[this.data.sectionIndex].id,
      this.data.row,
      this.data.seat,
    );
    if (!seat) {
      wx.showToast({
        title: "未找到该编号，请核对楼层、区域与排座",
        icon: "none",
      });
      return;
    }
    this.select({
      venueId: layout.venueId,
      layoutVersionId: layout.id,
      kind: "seat",
      seatId: seat.id,
    });
  },
  start(e: WechatMiniprogram.TouchCanvas) {
    const t = e.touches[0];
    gesture = {
      x: t.x,
      y: t.y,
      moved: false,
      distance:
        e.touches.length > 1
          ? Math.hypot(e.touches[1].x - t.x, e.touches[1].y - t.y)
          : 0,
    };
  },
  move(e: WechatMiniprogram.TouchCanvas) {
    if (!gesture) return;
    const t = e.touches[0],
      dx = t.x - gesture.x,
      dy = t.y - gesture.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) gesture.moved = true;
    if (e.touches.length > 1) {
      const d = Math.hypot(e.touches[1].x - t.x, e.touches[1].y - t.y);
      if (gesture.distance) this.zoomAt(d / gesture.distance, t.x, t.y);
      gesture.distance = d;
      gesture.moved = true;
    } else {
      transform.offsetX += dx;
      transform.offsetY += dy;
    }
    gesture.x = t.x;
    gesture.y = t.y;
    this.draw();
  },
  end() {
    if (gesture && !gesture.moved && layout) {
      const world = unproject(gesture.x, gesture.y, transform);
      if (layout.capabilities.seats) {
        if (transform.scale < 7) {
          this.zoomAt(1.8, gesture.x, gesture.y);
          this.draw();
        } else {
          const seat = hit?.(
            world.x,
            world.z,
            this.data.floor,
            Math.min(0.65, 10 / transform.scale),
          );
          if (seat)
            this.select({
              venueId: layout.venueId,
              layoutVersionId: layout.id,
              kind: "seat",
              seatId: seat.id,
            });
        }
      } else {
        const s = layout.sections.find(
          (s) =>
            s.floor === this.data.floor &&
            Math.abs(world.x - s.x) <= s.width / 2 &&
            Math.abs(world.z - s.z) <= s.depth / 2,
        );
        if (s)
          this.select({
            venueId: layout.venueId,
            layoutVersionId: layout.id,
            kind: "section",
            sectionId: s.id,
          });
      }
    }
    gesture = null;
    this.persist();
  },
  zoomAt(factor: number, x: number, y: number) {
    const p = unproject(x, y, transform);
    transform.scale = Math.max(3, Math.min(40, transform.scale * factor));
    transform.offsetX = x - p.x * transform.scale;
    transform.offsetY = y - p.z * transform.scale;
  },
  zoom(e: WechatMiniprogram.TouchEvent) {
    this.zoomAt(Number(e.currentTarget.dataset.factor), width / 2, height / 2);
    this.draw();
    this.persist();
  },
  reset() {
    transform = fitMap(width, height);
    this.draw();
    this.persist();
  },
  preview() {
    if (this.data.selected) {
      this.persist();
      wx.navigateTo({ url: sharePath(this.data.selected) });
    }
  },
  favorite() {
    if (this.data.selected) {
      store.favorite(this.data.selected);
      wx.showToast({ title: "本机收藏已更新", icon: "none" });
    }
  },
  async compare() {
    if (this.data.selected)
      try {
        await chooseCompare(this.data.selected);
        this.setData({ compareCount: store.compare.length });
      } catch (e) {
        wx.showToast({ title: errorText(e), icon: "none" });
      }
  },
  openCompare() {
    wx.navigateTo({ url: "/subpackages/venue/compare/index" });
  },
});
