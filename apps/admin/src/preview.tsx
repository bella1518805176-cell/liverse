import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  Eye,
  MapPin,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import type {
  Layout,
  PositionRef,
  PublicContent,
  Seat,
} from "../../../packages/contracts";
import { positionKey, validatePosition } from "../../../packages/contracts";
import {
  addCompare,
  fitMap,
  positionLabel,
  resolvePosition,
  project,
  searchSeat,
  unproject,
  type MapTransform,
} from "../../../packages/venue-core";
import { createVenueRenderer } from "../../../packages/venue-renderer";
import { api } from "./api";
import "./preview.css";
type Tab = "home" | "photos" | "me" | "map" | "view" | "compare";
function readLocal(key: string): PositionRef[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writeLocal(key: string, positions: PositionRef[]) {
  try {
    localStorage.setItem(key, JSON.stringify(positions));
  } catch {
    // The current session still works when the browser blocks local storage.
  }
}
function IconButton({
  label,
  children,
  onClick,
  active,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={`p-icon ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function PreviewApp({
  demoLayout,
  guest = false,
  images = {
    live: "/assets/beijing-live.jpg",
    balcony: "/assets/beijing-balcony.jpg",
  },
}: {
  demoLayout?: Layout;
  guest?: boolean;
  images?: { live: string; balcony: string };
} = {}) {
  const [tab, setTab] = useState<Tab>("home"),
    [layout, setLayout] = useState<Layout | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [floor, setFloor] = useState(""),
    [selected, setSelected] = useState<PositionRef | null>(null),
    [favorites, setFavorites] = useState<PositionRef[]>(() =>
      readLocal("lv:preview:favorites"),
    ),
    [recent, setRecent] = useState<PositionRef[]>(() =>
      readLocal("lv:preview:recent"),
    ),
    [compare, setCompare] = useState<PositionRef[]>([]),
    [activeCompare, setActiveCompare] = useState(0),
    [replace, setReplace] = useState<PositionRef | null>(null),
    [toast, setToast] = useState(""),
    [shareUrl, setShareUrl] = useState(""),
    [row, setRow] = useState(""),
    [seat, setSeat] = useState(""),
    [showSaved, setShowSaved] = useState(false),
    [contents, setContents] = useState<PublicContent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canShare = location.protocol === "https:" || location.protocol === "http:";
  const notify = (text: string) => {
    setToast(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3500);
  };
  async function load() {
    setLoading(true);
    setError("");
    try {
      const venues = demoLayout
        ? [{ id: demoLayout.venueId, layout: demoLayout }]
        : await api<Array<{ id: string; layout: Layout | null }>>("/venues");
      const l = venues.find((v) => v.id === "beijing")?.layout ?? null;
      setLayout(l);
      if (l) setFloor(l.floors[0]);
      if (window.location.hash.length > 1) {
        try {
          const p: unknown = JSON.parse(
            decodeURIComponent(window.location.hash.slice(1)),
          );
          if (!validatePosition(p)) throw new Error("分享位置无效");
          const sharedLayout =
            l?.id === p.layoutVersionId
              ? l
              : demoLayout
                ? (() => {
                    throw new Error("该位置不属于当前体验版本");
                  })()
                : await api<Layout>(
                    `/layouts/${encodeURIComponent(p.layoutVersionId)}`,
                  );
          const resolved = resolvePosition(sharedLayout, p);
          setLayout(sharedLayout);
          setFloor(
            "floor" in resolved ? resolved.floor : sharedLayout.floors[0],
          );
          setSelected(p);
          setTab("view");
        } catch (e) {
          notify(`无法打开分享位置：${(e as Error).message}`);
        }
      }
      const result = demoLayout
        ? { items: [] }
        : await api<{ items: PublicContent[] }>(
            "/contributions?venueId=beijing",
          );
      setContents(result.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const hashChanged = () => {
      if (!window.location.hash) setTab("home");
      void load();
    };
    window.addEventListener("hashchange", hashChanged);
    return () => {
      window.removeEventListener("hashchange", hashChanged);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const navigate = (next: Tab) => {
    setTab(next);
    window.scrollTo(0, 0);
  };
  function view(p: PositionRef) {
    setSelected(p);
    const next = [
      p,
      ...recent.filter((r) => positionKey(r) !== positionKey(p)),
    ].slice(0, 20);
    setRecent(next);
    writeLocal("lv:preview:recent", next);
    navigate("view");
  }
  function favorite(p: PositionRef) {
    const has = favorites.some((f) => positionKey(f) === positionKey(p));
    const next = has
      ? favorites.filter((f) => positionKey(f) !== positionKey(p))
      : [p, ...favorites];
    setFavorites(next);
    writeLocal("lv:preview:favorites", next);
    notify(has ? "已取消本机收藏" : "已保存到本机收藏");
  }
  function add(p: PositionRef) {
    try {
      setCompare(addCompare(compare, p));
      notify("已加入对比");
    } catch (e) {
      if (
        compare.length === 2 &&
        compare[0].layoutVersionId === p.layoutVersionId
      )
        setReplace(p);
      else notify((e as Error).message);
    }
  }
  const selectSeat = (s: Seat) => {
    if (layout)
      setSelected({
        venueId: layout.venueId,
        layoutVersionId: layout.id,
        kind: "seat",
        seatId: s.id,
      });
  };
  const isSaved =
    selected && favorites.some((p) => positionKey(p) === positionKey(selected));
  return (
    <div className="preview-shell">
      <div className="preview-desktop-mark">
        <span>LIVERSE</span>
        <span>观演视野 / 北京</span>
        {!demoLayout && (
          <a href="/">
            运营工作台 <ArrowUpRight size={14} />
          </a>
        )}
      </div>
      <main className={`preview ${tab === "map" ? "map-mode" : ""}`}>
        <div className="p-top">
          <div className="p-logo">
            LIVERSE<span>.</span>
          </div>
          <span className="p-city">
            <MapPin size={13} />
            北京
          </span>
          <span className="p-capsule">
            <span>•••</span>
            <i />
            <span>◉</span>
          </span>
        </div>
        {layout?.demo && (
          <div className="p-development">开发示例 · 非正式场馆排座与模型</div>
        )}
        {error && (
          <div className="p-error">
            {error}
            <button onClick={load}>重试</button>
          </div>
        )}
        {loading ? (
          <div className="p-empty">正在加载场馆资料…</div>
        ) : (
          <>
            {tab === "home" && (
              <>
                <section className={guest ? "p-hero p-guest-hero" : "p-hero"}>
                  {!guest && (
                    <img src={images.live} alt="北京 LIVERSE 宣传资料现场画面" />
                  )}
                  <div className="p-hero-overlay">
                    <span className="p-kicker">BEIJING · LIVE SPACE</span>
                    <h1>LIVERSE 北京</h1>
                    <p>{guest ? "选一个座位，看看舞台。" : "属于你的现场，从这里看见。"}</p>
                  </div>
                  <span className="p-photo-credit">
                    {guest ? "舞台示意" : "场馆宣传资料 · 非座位实拍"}
                  </span>
                </section>
                <section className="p-section">
                  <div className="p-heading">
                    <div>
                      <span className="p-kicker">FIND YOUR VIEW</span>
                      <h2>先找到位置，再走进现场</h2>
                    </div>
                    <span className="p-index">01 /</span>
                  </div>
                  {layout ? (
                    <>
                      <div className="p-layout-summary">
                        <div className="p-layout-symbol">
                          <MapPin size={22} />
                        </div>
                        <div>
                          <strong>标准座位布局</strong>
                          <p>
                            {layout.demo ? "开发示例 v1" : layout.name} ·{" "}
                            {layout.floors.length} 个楼层
                          </p>
                        </div>
                        <span className="p-status">
                          {layout.demo ? "示例" : "已发布"}
                        </span>
                      </div>
                      <button
                        className="p-primary p-wide"
                        onClick={() => navigate("map")}
                      >
                        进入看座 <ArrowRight size={18} />
                      </button>
                    </>
                  ) : (
                    <div className="p-empty">场馆资料准备中</div>
                  )}
                </section>
                {!guest && (
                  <section className="p-section">
                    <div className="p-heading">
                      <h2>现场的另一种视角</h2>
                      <button
                        className="p-text"
                        onClick={() => navigate("photos")}
                      >
                        查看实拍 <ArrowUpRight size={16} />
                      </button>
                    </div>
                    <div className="p-reference">
                      <img src={images.balcony} alt="场馆宣传资料二层座席区" />
                      <span>场馆参考 · 二层座席区</span>
                    </div>
                  </section>
                )}
                {recent.length > 0 && layout && (
                  <section className="p-section">
                    <div className="p-heading">
                      <h2>最近浏览</h2>
                      <span className="p-muted">本机保存</span>
                    </div>
                    {recent.slice(0, 3).map((p) => (
                      <button
                        key={positionKey(p)}
                        className="p-record"
                        onClick={() => view(p)}
                      >
                        <Eye size={17} />
                        {positionLabel(layout, p)}
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </section>
                )}
                <p className="p-footer-note">
                  位置资料用于观演参考，查看与收藏均不占座。
                </p>
              </>
            )}
            {tab === "map" && layout && (
              <>
                <section className="p-map-controls">
                  <div className="p-heading">
                    <button className="p-back" onClick={() => navigate("home")}>
                      <ArrowLeft size={18} />
                      标准座位图
                    </button>
                    <button
                      className="p-text"
                      onClick={() => navigate("compare")}
                    >
                      对比 <span className="p-count">{compare.length}/2</span>
                    </button>
                  </div>
                  <div className="p-segments">
                    {layout.floors.map((f) => (
                      <button
                        key={f}
                        className={floor === f ? "active" : ""}
                        onClick={() => {
                          setFloor(f);
                          setSelected(null);
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  {layout.capabilities.seats && (
                    <form
                      className="p-search"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const section = layout.sections.find(
                          (s) => s.floor === floor,
                        );
                        const result =
                          section &&
                          searchSeat(layout, floor, section.id, row, seat);
                        if (result) selectSeat(result);
                        else notify("未找到该编号，请核对楼层与排座");
                      }}
                    >
                      <input
                        aria-label="排号"
                        placeholder="排号，如 D01"
                        value={row}
                        onChange={(e) => setRow(e.target.value)}
                      />
                      <input
                        aria-label="座号"
                        placeholder="座号，如 01"
                        value={seat}
                        onChange={(e) => setSeat(e.target.value)}
                      />
                      <button type="submit">查找</button>
                    </form>
                  )}
                </section>
                <SeatMap
                  layout={layout}
                  floor={floor}
                  selected={selected}
                  onSelect={selectSeat}
                />
                <section className="p-seat-drawer">
                  <div className="p-drawer-handle" />
                  {selected ? (
                    <>
                      <div className="p-heading">
                        <div>
                          <span className="p-kicker">SELECTED POSITION</span>
                          <h2>{positionLabel(layout, selected)}</h2>
                        </div>
                        <span className="p-badge">模型模拟</span>
                      </div>
                      <p className="p-muted">
                        {layout.demo
                          ? "开发示例，不代表真实座位或视野"
                          : layout.source}
                      </p>
                      <div className="p-selected-actions">
                        <button
                          className="p-primary"
                          onClick={() => view(selected)}
                        >
                          查看视野 <ArrowUpRight size={17} />
                        </button>
                        <IconButton
                          label={isSaved ? "取消收藏" : "收藏位置"}
                          active={!!isSaved}
                          onClick={() => favorite(selected)}
                        >
                          <Bookmark size={20} />
                        </IconButton>
                        <IconButton
                          label="加入对比"
                          onClick={() => add(selected)}
                        >
                          <Plus size={21} />
                        </IconButton>
                      </div>
                    </>
                  ) : (
                    <div className="p-unselected">
                      <MapPin size={20} />
                      <div>
                        <strong>选择一个位置</strong>
                        <p>舞台方向朝上 · 标准布局</p>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
            {tab === "view" && selected && layout && (
              <>
                <section className="p-view-title">
                  <button className="p-back" onClick={() => navigate("map")}>
                    <ArrowLeft size={18} />
                    座位视野
                  </button>
                  <span className="p-badge">模型模拟</span>
                </section>
                {layout.demo && layout.capabilities.model ? (
                  <ModelView layout={layout} position={selected} />
                ) : (
                  <div className="p-empty">暂无可用的校准模型</div>
                )}
                <section className="p-section">
                  <div className="p-heading">
                    <div>
                      <span className="p-kicker">YOUR POSITION</span>
                      <h2>{positionLabel(layout, selected)}</h2>
                    </div>
                    <span className="p-index">↗</span>
                  </div>
                  <p className="p-muted">{layout.name}</p>
                  <div className="p-source">{layout.source}</div>
                  <div className="p-selected-actions">
                    <button
                      className="p-primary"
                      onClick={() => {
                        add(selected);
                        navigate("compare");
                      }}
                    >
                      加入对比 <Plus size={17} />
                    </button>
                    <IconButton
                      label={isSaved ? "取消收藏" : "收藏位置"}
                      active={!!isSaved}
                      onClick={() => favorite(selected)}
                    >
                      <Bookmark size={20} />
                    </IconButton>
                    {canShare && (
                      <IconButton
                        label="分享位置"
                        onClick={async () => {
                          const url = new URL(location.href);
                          url.hash = encodeURIComponent(JSON.stringify(selected));
                          try {
                            await navigator.clipboard.writeText(url.href);
                            notify("位置链接已复制");
                          } catch {
                            if (navigator.share) {
                              try {
                                await navigator.share({
                                  title: "LIVERSE · 观演视野",
                                  url: url.href,
                                });
                              } catch {
                                notify("分享已取消");
                              }
                            } else {
                              setShareUrl(url.href);
                            }
                          }
                        }}
                      >
                        <Share2 size={19} />
                      </IconButton>
                    )}
                  </div>
                </section>
                {!guest && (
                  <section className="p-section">
                    <div className="p-heading">
                      <h2>这个位置的实拍</h2>
                      <Camera size={18} />
                    </div>
                    <div className="p-empty compact">暂无匹配的已核验实拍</div>
                  </section>
                )}
              </>
            )}
            {tab === "compare" && layout && (
              <>
                <section className="p-section">
                  <button className="p-back" onClick={() => navigate("map")}>
                    <ArrowLeft size={18} />
                    位置对比
                  </button>
                  <h1 className="p-page-title">同一个舞台，两种视角</h1>
                  <p className="p-muted">
                    {guest ? "切换位置，比较舞台视野。" : "同版本模型使用相同基准。实拍条件不同，分别浏览。"}
                  </p>
                  <div className="p-compare-tabs">
                    {compare.map((p, i) => (
                      <button
                        key={positionKey(p)}
                        className={activeCompare === i ? "active" : ""}
                        onClick={() => setActiveCompare(i)}
                      >
                        <span>{i === 0 ? "A" : "B"}</span>
                        <strong>{positionLabel(layout, p)}</strong>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`移除位置 ${i ? "B" : "A"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCompare(compare.filter((_, j) => i !== j));
                            setActiveCompare(0);
                          }}
                        >
                          <X size={16} />
                        </span>
                      </button>
                    ))}
                  </div>
                  {compare.length < 2 && (
                    <button
                      className="p-secondary p-wide"
                      onClick={() => navigate("map")}
                    >
                      <Plus size={17} />
                      继续选择位置
                    </button>
                  )}
                </section>
                {compare[activeCompare] && (
                  <>
                    <ModelView
                      key={positionKey(compare[activeCompare])}
                      layout={layout}
                      position={compare[activeCompare]}
                    />
                    <div className="p-section">
                      <button
                        className="p-primary p-wide"
                        onClick={() => favorite(compare[activeCompare])}
                      >
                        <Bookmark size={17} />
                        收藏当前候选
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {tab === "photos" && (
              <section className="p-section">
                <div className="p-heading">
                  <div>
                    <span className="p-kicker">FROM THE CROWD</span>
                    <h1 className="p-page-title">现场实拍</h1>
                  </div>
                  <Camera size={24} />
                </div>
                <div className="p-filter">
                  <span>
                    全部场次 <ChevronDown size={14} />
                  </span>
                  <span>
                    全部区域 <ChevronDown size={14} />
                  </span>
                </div>
                {contents.length === 0 ? (
                  <div className="p-empty">
                    <Camera size={32} />
                    <h3>还没有公开的现场分享</h3>
                    <p>等待第一份真实的现场记录。</p>
                    <button
                      className="p-secondary"
                      onClick={() => navigate("map")}
                    >
                      返回看座 <ArrowRight size={16} />
                    </button>
                  </div>
                ) : (
                  contents.map((c) => (
                    <article className="p-content" key={c.id}>
                      {c.mediaIds[0] && (
                        <img
                          src={`/api/v1/media/${c.mediaIds[0]}`}
                          alt="观众投稿"
                        />
                      )}
                      <span className="p-badge">
                        {c.source === "official" ? "官方参考" : "观众分享"}
                      </span>
                      <p>{c.text}</p>
                      <span className="p-muted">{c.displayName}</span>
                    </article>
                  ))
                )}
              </section>
            )}
            {tab === "me" && (
              <section className="p-section">
                <div className="p-profile">
                  <div className="p-avatar">
                    <UserRound size={26} />
                  </div>
                  <div>
                    <span className="p-kicker">MY LIVE MOMENTS</span>
                    <h1 className="p-page-title">现场的你</h1>
                    <p className="p-muted">本机浏览 · 无需登录</p>
                  </div>
                </div>
                <div className="p-profile-stats">
                  <button onClick={() => setShowSaved(true)}>
                    <strong>{favorites.length}</strong>
                    <span>本机收藏</span>
                  </button>
                  <button onClick={() => setShowSaved(false)}>
                    <strong>{recent.length}</strong>
                    <span>最近浏览</span>
                  </button>
                  <div>
                    <strong>{compare.length}</strong>
                    <span>候选位置</span>
                  </div>
                </div>
                <div className="p-heading">
                  <h2>{showSaved ? "本机收藏" : "最近浏览"}</h2>
                  <button
                    className="p-text"
                    onClick={() => setShowSaved(!showSaved)}
                  >
                    {showSaved ? "最近浏览" : "全部收藏"}{" "}
                    <ArrowRight size={14} />
                  </button>
                </div>
                {(showSaved ? favorites : recent).length === 0 ? (
                  <div className="p-empty compact">
                    还没有记录，去找到你的现场视角。
                  </div>
                ) : (
                  (showSaved ? favorites : recent).map((p) => (
                    <button
                      className="p-record"
                      key={positionKey(p)}
                      onClick={() => view(p)}
                    >
                      <Bookmark size={17} />
                      {layout ? positionLabel(layout, p) : "位置"}
                      <ArrowUpRight size={16} />
                    </button>
                  ))
                )}
                <div className="p-source">
                  {guest
                    ? "收藏和浏览记录仅保存在当前浏览器。"
                    : "本机记录保存在当前浏览器。微信账号、投稿与个人工单请在原生小程序中使用。"}
                </div>
                <button
                  className="p-secondary p-wide"
                  onClick={() => navigate("map")}
                >
                  继续看座 <ArrowRight size={17} />
                </button>
              </section>
            )}
          </>
        )}
        {["home", "photos", "me"].includes(tab) && (
          <nav className="p-tabbar">
            {(
              [
                { key: "home", label: "看座", Icon: Eye },
                { key: "photos", label: "实拍", Icon: Camera },
                { key: "me", label: "我的", Icon: UserRound },
              ] as const
            ).filter(({ key }) => !guest || key !== "photos").map(({ key, label, Icon }) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => navigate(key)}
              >
                <Icon size={21} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
        {toast && (
          <div className="p-toast" role="status">
            {toast}
          </div>
        )}
        {shareUrl && (
          <div className="p-modal-backdrop">
            <div className="p-modal" role="dialog" aria-label="分享位置链接">
              <div className="p-heading">
                <h2>分享位置</h2>
                <IconButton label="关闭分享" onClick={() => setShareUrl("")}>
                  <X size={18} />
                </IconButton>
              </div>
              <input
                aria-label="位置链接"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>
          </div>
        )}
        {replace && (
          <div className="p-modal-backdrop">
            <div className="p-modal">
              <h2>替换哪个候选位置？</h2>
              <p className="p-muted">最多同时对比两个位置。</p>
              {compare.map((p, i) => (
                <button
                  className="p-secondary p-wide"
                  key={positionKey(p)}
                  onClick={() => {
                    setCompare(addCompare(compare, replace, i));
                    setReplace(null);
                    notify("候选位置已替换");
                  }}
                >
                  {i ? "B" : "A"} · {layout && positionLabel(layout, p)}
                </button>
              ))}
              <button className="p-text" onClick={() => setReplace(null)}>
                取消
              </button>
            </div>
          </div>
        )}
      </main>
      <div className="preview-desktop-caption">
        <span>
          {demoLayout ? "LIVERSE · 体验版" : "原生微信小程序 · 浏览器交互预览"}
        </span>
        <span>资料类型始终可见 / 不提供订座或售票</span>
      </div>
    </div>
  );
}
function SeatMap({
  layout,
  floor,
  selected,
  onSelect,
}: {
  layout: Layout;
  floor: string;
  selected: PositionRef | null;
  onSelect: (s: Seat) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    transformRef = useRef<MapTransform | null>(null),
    sizeRef = useRef({ width: 390, height: 400 }),
    pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [zoom, setZoom] = useState("1.0");
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = sizeRef.current;
    const t = transformRef.current ?? fitMap(width, height);
    transformRef.current = t;
    const c = canvas.getContext("2d")!;
    c.clearRect(0, 0, width, height);
    c.fillStyle = "#11171d";
    c.fillRect(0, 0, width, height);
    c.strokeStyle = "#222c35";
    c.lineWidth = 0.5;
    for (let x = 0; x < width; x += 24) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, height);
      c.stroke();
    }
    for (let y = 0; y < height; y += 24) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(width, y);
      c.stroke();
    }
    const stage = project(-12.5, -1, t);
    c.fillStyle = "#ff5018";
    c.fillRect(stage.x, stage.y, 25 * t.scale, 3.5 * t.scale);
    c.fillStyle = "white";
    c.font = "bold 11px sans-serif";
    c.textAlign = "center";
    c.fillText("STAGE / 舞台", t.offsetX, stage.y + 2.2 * t.scale);
    for (const seat of layout.seats.filter((s) => s.floor === floor)) {
      const p = project(seat.x, seat.z, t),
        size = Math.max(3, Math.min(12, t.scale * 0.7));
      c.fillStyle =
        selected?.kind === "seat" && selected.seatId === seat.id
          ? "#ff5018"
          : "#8999a7";
      c.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      if (selected?.kind === "seat" && selected.seatId === seat.id) {
        c.strokeStyle = "#ffb395";
        c.lineWidth = 1.5;
        c.strokeRect(
          p.x - size / 2 - 3,
          p.y - size / 2 - 3,
          size + 6,
          size + 6,
        );
      }
    }
    c.fillStyle = "#808f9c";
    c.font = "10px sans-serif";
    c.fillText("开发示例 · 布局未经场馆核验", width / 2, height - 20);
    setZoom((t.scale / fitMap(width, height).scale).toFixed(1));
  }
  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { width: rect.width, height: rect.height };
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [layout, floor, selected]);
  function zoomBy(factor: number) {
    const t = transformRef.current!,
      { width, height } = sizeRef.current;
    const center = unproject(width / 2, height / 2, t);
    t.scale = Math.min(40, Math.max(4, t.scale * factor));
    t.offsetX = width / 2 - center.x * t.scale;
    t.offsetY = height / 2 - center.z * t.scale;
    draw();
  }
  return (
    <div className="p-map-wrap">
      <canvas
        aria-label="开发示例座位图"
        ref={canvasRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointer.current = {
            x: e.nativeEvent.offsetX,
            y: e.nativeEvent.offsetY,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          if (!pointer.current) return;
          const p = pointer.current,
            dx = e.nativeEvent.offsetX - p.x,
            dy = e.nativeEvent.offsetY - p.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true;
          transformRef.current!.offsetX += dx;
          transformRef.current!.offsetY += dy;
          p.x = e.nativeEvent.offsetX;
          p.y = e.nativeEvent.offsetY;
          draw();
        }}
        onPointerUp={(e) => {
          if (pointer.current && !pointer.current.moved) {
            const p = unproject(
              e.nativeEvent.offsetX,
              e.nativeEvent.offsetY,
              transformRef.current!,
            );
            const result = layout.seats
              .filter((s) => s.floor === floor)
              .find((s) => Math.hypot(s.x - p.x, s.z - p.z) < 0.8);
            if (result) onSelect(result);
          }
          pointer.current = null;
        }}
        onPointerCancel={() => (pointer.current = null)}
      />
      <div className="p-map-legend">
        <span />
        <span>参考位置</span>
        <i />
        <span>当前选择</span>
      </div>
      <div className="p-map-tools">
        <IconButton label="放大地图" onClick={() => zoomBy(1.3)}>
          <Plus size={18} />
        </IconButton>
        <span>{zoom}×</span>
        <IconButton label="缩小地图" onClick={() => zoomBy(0.77)}>
          <Minus size={18} />
        </IconButton>
        <IconButton
          label="复位地图"
          onClick={() => {
            transformRef.current = fitMap(
              sizeRef.current.width,
              sizeRef.current.height,
            );
            draw();
          }}
        >
          <RotateCcw size={17} />
        </IconButton>
      </div>
    </div>
  );
}
function ModelView({
  layout,
  position,
}: {
  layout: Layout;
  position: PositionRef;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    renderer = useRef<ReturnType<typeof createVenueRenderer> | null>(null),
    drag = useRef<{ x: number; y: number } | null>(null);
  const [error, setError] = useState(""),
    [standing, setStanding] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setError("");
    const element = canvas.current!;
    const rect = element.getBoundingClientRect();
    let r: ReturnType<typeof createVenueRenderer> | null = null;
    try {
      if (!layout.demo) throw new Error("正式模型尚未完成校准");
      r = createVenueRenderer(
        THREE,
        {
          canvas: element,
          width: rect.width,
          height: rect.height,
          dpr: devicePixelRatio,
          requestFrame: (cb) => requestAnimationFrame(cb),
          cancelFrame: (id) => cancelAnimationFrame(id),
        },
        layout,
      );
      r.select(position, standing);
      renderer.current = r;
    } catch (error) {
      console.warn("Venue renderer initialization failed", error);
      setError("3D 暂不可用，请重试或返回座位图。");
    }
    const lost = (e: Event) => {
      e.preventDefault();
      r?.pause();
      setError("3D 场景已中断，当前位置已保留。");
    };
    const visibility = () => (document.hidden ? r?.pause() : r?.resume());
    element.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      element.removeEventListener("webglcontextlost", lost);
      document.removeEventListener("visibilitychange", visibility);
      r?.destroy();
      renderer.current = null;
    };
  }, [layout, position, retry]);
  return (
    <div className="p-model">
      <canvas
        ref={canvas}
        aria-label="开发示例 3D 视角"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            renderer.current?.look(
              e.clientX - drag.current.x,
              e.clientY - drag.current.y,
            );
            drag.current = { x: e.clientX, y: e.clientY };
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      <span className="p-model-caption">开发示例 · 标准参考 · 60° FOV</span>
      <div className="p-model-crosshair">+</div>
      <div className="p-model-tools">
        <IconButton label="复位视角" onClick={() => renderer.current?.reset()}>
          <RotateCcw size={18} />
        </IconButton>
        <IconButton
          label="场馆总览"
          onClick={() => renderer.current?.overview()}
        >
          <Maximize2 size={18} />
        </IconButton>
      </div>
      <label className="p-standing">
        <span>坐姿</span>
        <input
          type="checkbox"
          aria-label="站姿模拟"
          checked={standing}
          onChange={(e) => {
            setStanding(e.target.checked);
            renderer.current?.select(position, e.target.checked);
          }}
        />
        <span>站姿</span>
      </label>
      {error && (
        <div className="p-model-error">
          <p>{error}</p>
          <button className="p-secondary" onClick={() => setRetry(retry + 1)}>
            重试
          </button>
        </div>
      )}
    </div>
  );
}
