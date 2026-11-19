import { lazy, Suspense, useEffect, useState, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, ImagePlus, MapPin, Minus, Plus, RotateCcw, Send, UserRound, X } from "lucide-react";
import logo from "./assets/liverse-logo-reference.png";
import { contentTags, demoContent, getSeats, layout, mapRows, sectionOptions, shows, totalSeats, venue, type ContentItem, type ContentScope, type Seat } from "./demo-data";
import { getSection, sectionPaths, type Tab } from "./routes";
import { loadSubmissions, saveSubmission, type Submission } from "./submissions";
import { DraftPreview, SubmissionPhoto } from "./SubmissionPhoto";
import type { CameraMode, Floor } from "./venue-data";
import "./style.css";

const Venue3D = lazy(() => import("./Venue3D"));

type Sheet = "venue" | "show" | "position" | null;
type ComposerMode = "photo" | "feeling" | null;
type ContentKind = "all" | "photo" | "feeling";
const showOptions = shows.map(({ id, name }) => <option key={id}>{name}</option>);
const defaultName = "热心观众";

function App() {
  const [section, setSection] = useState(() => getSection(location.pathname));
  const tab = section ?? "look";
  const landing = section === null;
  const [floor, setFloor] = useState<Floor>("1F");
  const [positionFloor, setPositionFloor] = useState<Floor>("1F");
  const [positionRow, setPositionRow] = useState(1);
  const [positionNumber, setPositionNumber] = useState(1);
  const [view, setView] = useState<"2D" | "3D">("2D");
  const [camera, setCamera] = useState<CameraMode>("场馆总览");
  const [show, setShow] = useState(shows[0].name);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selected, setSelected] = useState<Seat | null>(null);
  const [zoom, setZoom] = useState(1);
  const [contentScope, setContentScope] = useState<ContentScope>("venue");
  const [contentKind, setContentKind] = useState<ContentKind>("all");
  const [contentShow, setContentShow] = useState("当前场次");
  const [tagFilter, setTagFilter] = useState("全部标签");
  const [composer, setComposer] = useState<ComposerMode>(null);
  const [draftPhotos, setDraftPhotos] = useState<{ id: string; file: File }[]>([]);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftSection, setDraftSection] = useState("");
  const [draftFloor, setDraftFloor] = useState<Floor>("1F");
  const [draftShow, setDraftShow] = useState(show);
  const [draftNote, setDraftNote] = useState("");
  const [draftName, setDraftName] = useState(defaultName);
  const [draftRow, setDraftRow] = useState("");
  const [draftSeat, setDraftSeat] = useState("");
  const [draftConsent, setDraftConsent] = useState(false);
  const [eventProposal, setEventProposal] = useState(false);
  const [proposalName, setProposalName] = useState("");
  const [proposalDate, setProposalDate] = useState("");
  const [submittedItems, setSubmittedItems] = useState(loadSubmissions);
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const seats = getSeats(floor);
  const closeComposer = () => { setComposer(null); setDraftPhotos([]); };
  useEffect(() => {
    const onPopState = () => {
      setSection(getSection(location.pathname));
      setSheet(null);
      closeComposer();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const setTab = (next: Tab) => {
    if (next !== section) history.pushState(null, "", sectionPaths[next]);
    setSection(next);
  };
  const changeFloor = (next: Floor) => {
    setFloor(next);
    if (selected?.floor !== next) setSelected(null);
    setZoom(1);
  };
  const position = selected ? `${venue.name} · ${selected.floor}${selected.area} · ${selected.row}排${selected.number}号${selected.obstructed ? " · 有遮挡" : ""}` : "尚未选择位置";
  const openPosition = () => {
    const targetFloor = selected?.floor ?? floor;
    setPositionFloor(targetFloor);
    setPositionRow(selected?.floor === targetFloor ? selected.row : 1);
    setPositionNumber(selected?.floor === targetFloor ? selected.number : 1);
    setSheet("position");
  };
  const positionRows = mapRows(positionFloor).map((seat) => seat.row);
  const positionSeats = getSeats(positionFloor).filter((seat) => seat.row === positionRow);
  const selectedArea = selected?.area;
  const visibleContent = demoContent.filter((item) => {
    const scopeMatch = contentScope === "venue"
      ? true
      : contentScope === "section"
        ? item.scope === "section" && item.area === selectedArea
        : item.scope === "seat" && item.floor === selected?.floor && item.row === selected?.row && item.number === selected?.number;
    const showMatch = contentShow === "全部场次" || contentShow === "当前场次" ? (contentShow === "全部场次" || item.show === show) : item.show === contentShow;
    const kindMatch = contentKind === "all" || (contentKind === "photo" ? item.kind === "photo" : item.kind === "feeling");
    const tagMatch = tagFilter === "全部标签" || item.tags.includes(tagFilter);
    return scopeMatch && showMatch && kindMatch && tagMatch && item.state === "published";
  });
  const openComposer = (mode: ComposerMode) => {
    setComposer(mode);
    setDraftShow(show);
    setDraftFloor(selected?.floor ?? floor);
    setDraftSection(selected?.area ?? "");
    setDraftRow(selected ? String(selected.row) : "");
    setDraftSeat(selected ? String(selected.number) : "");
    setDraftTags([]);
    setDraftPhotos([]);
    setDraftNote("");
    setDraftName(defaultName);
    setDraftConsent(false);
    setEventProposal(false);
    setProposalName("");
    setProposalDate("");
    setSubmitError("");
  };
  const choosePhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 4 - draftPhotos.length);
    event.target.value = "";
    if (files.some((file) => file.size > 20 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setSubmitError("请选择不超过 20 MB 的 JPG、PNG 或 WebP 照片");
      return;
    }
    setSubmitError("");
    const next = files.map((file) => ({ id: crypto.randomUUID(), file }));
    setDraftPhotos((current) => [...current, ...next]);
  };
  const submitComposer = async () => {
    if (!composer || saving) return;
    const hasEvent = !eventProposal && Boolean(draftShow) || eventProposal && Boolean(proposalName && proposalDate);
    if (!draftSection || !hasEvent || !draftConsent || (composer === "photo" && draftPhotos.length === 0) || (composer === "feeling" && !draftNote.trim())) {
      setSubmitError("请完成场馆、场次、实际拍摄分区、内容和公开授权确认");
      return;
    }
    const item: Submission = {
      id: crypto.randomUUID(),
      kind: composer === "photo" ? "photo" : "feeling",
      scope: draftSeat ? "seat" : "section",
      floor: draftFloor,
      area: draftSection,
      row: draftRow ? Number(draftRow) : undefined,
      number: draftSeat ? Number(draftSeat) : undefined,
      show: eventProposal ? `${proposalName}（待补录）` : draftShow,
      text: draftNote.trim() || "已上传现场实拍。",
      tags: draftTags,
      displayName: draftName.trim() || defaultName,
      photoCount: draftPhotos.length,
      proposalDate: eventProposal ? proposalDate : undefined,
      state: "pending",
    };
    setSaving(true);
    try {
      setSubmittedItems(await saveSubmission(item, draftPhotos.map(({ file }) => file)));
      closeComposer();
      setTab("me");
    } catch {
      setSubmitError("浏览器无法保存投稿，请检查站点存储权限或可用空间后重试");
    } finally {
      setSaving(false);
    }
  };
  const selectSeat = (seat: Seat) => {
    setSelected(seat);
    setContentScope("seat");
  };
  const contentLocation = (item: ContentItem) => {
    if (item.scope === "venue") return "全馆参考";
    if (item.scope === "section") return `${item.floor ?? ""}${item.area ?? ""}`;
    return `${item.floor ?? ""}${item.area ?? ""} · ${item.row}排${item.number}号`;
  };
  const renderContentCard = (item: ContentItem) => <article className={`content-card ${item.kind === "feeling" ? "feeling-card" : ""}`} key={item.id}>
    {item.kind === "photo" && <div className={`content-photo ${item.photo ?? "photo-default"}`} role="img" aria-label="用户现场实拍"><Camera size={22} /><span>现场实拍</span></div>}
    <div className="content-card-body"><div className="content-card-top"><span className="content-source">{item.kind === "photo" ? "用户实拍" : "现场感受"}</span><span className="content-location">{contentLocation(item)}</span></div><p>{item.text}</p><div className="content-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="content-card-meta"><span>{item.show}</span><strong>{item.displayName}</strong></div></div>
  </article>;
  const contentSection = <section className="field-reference" aria-label="现场参考">
    <div className="field-reference-heading"><div><p className="section-kicker">LIVE REFERENCE</p><h2>{selected ? "这个位置的现场参考" : "现场参考"}</h2><small>{selected ? position : "从示例照片和观众感受了解现场"}</small></div><span className="reference-count">{visibleContent.length} 条</span></div>
    <div className="reference-filters"><select aria-label="实拍场次" value={contentShow} onChange={(event) => setContentShow(event.target.value)}><option>当前场次</option><option>全部场次</option>{showOptions}</select><div className="segmented scope-toggle" aria-label="实拍范围">{(["seat", "section", "venue"] as ContentScope[]).map((scope) => <button key={scope} className={contentScope === scope ? "active" : ""} disabled={scope === "seat" && !selected} onClick={() => setContentScope(scope)}>{scope === "seat" ? "该位置实拍" : scope === "section" ? "同区实拍" : "全馆实拍"}</button>)}</div></div>
    <div className="reference-kind-row"><div className="segmented kind-toggle" aria-label="内容类型">{(["all", "photo", "feeling"] as ContentKind[]).map((kind) => <button key={kind} className={contentKind === kind ? "active" : ""} onClick={() => setContentKind(kind)}>{kind === "all" ? "全部" : kind === "photo" ? "照片" : "感受"}</button>)}</div><select aria-label="视角标签" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option>全部标签</option>{contentTags.map((tag) => <option key={tag}>{tag}</option>)}</select></div>
    {visibleContent.length ? <div className="content-list">{visibleContent.map(renderContentCard)}</div> : <div className="content-empty"><ImagePlus size={23} /><strong>当前条件暂无实拍</strong><p>你可以上传第一张现场照片，帮助其他观众判断视野。</p><button className="text-button" onClick={() => setContentScope(selected ? "section" : "venue")}>查看其他范围</button></div>}
    <div className="reference-actions"><button className="primary-action" onClick={() => openComposer("photo")}><ImagePlus size={16} />上传实拍</button><button className="secondary-action" onClick={() => openComposer("feeling")}><Send size={15} />分享感受</button></div>
  </section>;

  return <main className={`app-shell ${landing ? "landing-shell" : ""}`}>
    {landing ? <>
      <header className="landing-topbar">
        <img className="landing-logo" src={logo} alt="LIVERSE" />
        <div className="landing-topline"><strong>观演视野</strong><span>品牌现场影像</span></div>
      </header>
      <section className="landing-hero" aria-label="LIVERSE 入口">
        <div className="landing-content">
          <img className="landing-content-logo" src={logo} alt="LIVERSE" />
          <span className="landing-rule" />
          <h1>属于你的现场，从这里看见</h1>
          <p>从座位出发，提前了解舞台视角与真实现场</p>
          <div className="landing-actions">
            <button className="landing-primary" onClick={() => setTab("look")}>开始看视野</button>
            <button className="landing-secondary" onClick={() => setTab("onsite")}>进入在现场</button>
          </div>
        </div>
      </section>
      <nav className="bottom-nav landing-nav" aria-label="主导航">
        <button className={tab === "look" ? "active" : ""} onClick={() => setTab("look")}><MapPin size={18} /><span>看视野</span></button>
        <button className={tab === "onsite" ? "active" : ""} onClick={() => setTab("onsite")}><Camera size={18} /><span>在现场</span></button>
        <button className={tab === "me" ? "active" : ""} onClick={() => setTab("me")}><UserRound size={18} /><span>我的</span></button>
      </nav>
    </> : <>
    <header className="topbar">
      <img className="brand-logo" src={logo} alt="LIVERSE" />
      <button className="context-button venue-choice" onClick={() => setSheet("venue")} aria-label="选择场馆">
        <span className="venue-pin"><MapPin size={15} /></span><span><strong>{venue.name}</strong><small>{venue.subtitle}</small></span><ChevronDown size={15} />
      </button>
      <button className="context-button show-choice" onClick={() => setSheet("show")} aria-label="选择场次">
        <span><small>当前场次</small><strong>{show}</strong></span><ChevronDown size={15} />
      </button>
      <div className="mini-capsule"><span>···</span><i /><span className="capsule-ring" /></div>
    </header>

    {tab === "look" ? <>
    <section className="page-heading">
      <div><p className="eyebrow">SEATING EXPLORER <span>{venue.city}</span></p><h1>找到你的现场位置</h1></div>
      <div className="current-layout"><span className="layout-dot" /><div><strong>全坐席{totalSeats}</strong><small>{show} · 演示场次</small></div><CircleHelp size={16} /></div>
    </section>

    <section className="controls-row">
      <div className="segmented view-toggle" aria-label="视图模式">
        {(["2D", "3D"] as const).map((mode) => <button key={mode} className={view === mode ? "active" : ""} onClick={() => setView(mode)}>{mode === "2D" ? "座位图" : "3D 视图"}</button>)}
      </div>
      <div className="segmented floor-toggle" aria-label="楼层">
        {(["1F", "2F"] as const).map((item) => <button key={item} className={floor === item ? "active" : ""} onClick={() => changeFloor(item)}>{item}<span>{item === "1F" ? "一楼" : "二楼"}</span></button>)}
      </div>
      <button className="outline-button position-trigger" onClick={openPosition}>{selected ? "更换位置" : "选位置"}<ChevronUp size={15} /></button>
    </section>

    <section className={`map-panel ${view === "3D" ? "mode-3d" : ""}`}>
      {view === "2D" ? <>
        <div className="map-meta"><span>{floor} · {floor === "1F" ? "场次座位布局" : "固定坐席"}</span><span className="map-count">{seats.length} 个座位</span></div>
        <div className="map-stage" aria-label={`${floor} 座位图`}>
          <div className={`map-transform ${zoom >= 1.4 ? "zoomed" : ""}`} style={{ transform: `scale(${zoom})` }}>
            <svg viewBox={`0 0 1000 ${layout[floor].height}`} role="img" aria-label={`${floor} 座位分布示意图`}>
              <defs><pattern id="map-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#edf0ee" strokeWidth="1" /></pattern></defs>
              <rect width="1000" height={layout[floor].height} fill="url(#map-grid)" />
              <path className="stage-outline" d={layout[floor].stagePath} />
              <text className="stage-label" x="500" y="72" textAnchor="middle">舞 台</text>
              {floor === "1F" && <>
                <text className="zone-label" x="500" y="125" textAnchor="middle">前 区</text>
                <rect className="control-zone" {...layout["1F"].control} rx="4" />
                <text className="control-label" x="500" y="603" textAnchor="middle">控台</text>
                <text className="zone-label" x="500" y="756" textAnchor="middle">后区 · 有遮挡</text>
              </>}
              {floor === "2F" && <text className="zone-label" x="500" y="113" textAnchor="middle">二楼固定坐席</text>}
              {seats.map((seat) => {
                const active = selected?.floor === seat.floor && selected.row === seat.row && selected.number === seat.number;
                const { x } = seat;
                return <g key={`${seat.floor}-${seat.row}-${seat.number}`} className={`seat ${seat.obstructed ? "obstructed" : ""} ${active ? "selected" : ""}`} role="button" tabIndex={0} aria-label={`${seat.floor}${seat.area} ${seat.row}排${seat.number}号${seat.obstructed ? " 有遮挡" : ""}`} onClick={() => selectSeat(seat)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectSeat(seat); }}>
                  <circle cx={x} cy={seat.y} r={floor === "1F" ? 6 : 7} /><text className="seat-number" x={x} y={seat.y + 3}>{seat.number}</text><title>{seat.row}排{seat.number}号{seat.obstructed ? " · 有遮挡" : ""}</title>
                </g>;
              })}
              {mapRows(floor).map(({ row, y }) => <text key={row} className="row-label" x={layout[floor].labelX} y={y + 4}>{row}</text>)}
              <text className="row-caption" x={floor === "1F" ? 102 : 20} y={floor === "1F" ? 445 : 580} transform={`rotate(-90 ${floor === "1F" ? 102 : 20} ${floor === "1F" ? 445 : 580})`}>排号</text>
            </svg>
          </div>
        </div>
        <div className={`map-footer ${floor === "2F" ? "floor-2f-legend" : ""}`}><span><i className="legend-seat" />可选位置</span>{floor === "2F" && <span><i className="legend-obstructed" />有遮挡</span>}<span><i className="legend-selected" />当前选择</span><div className="map-tools"><button aria-label="缩小" onClick={() => setZoom(Math.max(0.8, zoom - 0.15))}><Minus size={15} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="放大" onClick={() => setZoom(Math.min(2.5, zoom + 0.15))}><Plus size={15} /></button><button aria-label="复位" onClick={() => setZoom(1)}><RotateCcw size={14} /></button></div></div>
        <div className="data-note"><span>i</span><p>{layout[floor].note}</p><strong>图纸布局</strong></div>
      </> : <>
        <div className="map-meta"><span>3D 视图 <em>模型预览</em></span><span className="map-count">全坐席 · {totalSeats} 座</span></div>
        <Suspense fallback={<div className="model-loading" role="status">正在加载场馆模型…</div>}>
          <Venue3D mode={camera} selected={selected} position={position} onChoose={openPosition} onMap={() => setView("2D")} onSelect={(ref) => {
            const seat = getSeats(ref.floor).find((item) => item.row === ref.row && item.number === ref.number);
            if (seat) { setFloor(ref.floor); selectSeat(seat); }
          }} />
        </Suspense>
        <div className="camera-modes">{(["场馆总览", "观众视角", "手机取景"] as CameraMode[]).map((mode, i) => <button key={mode} className={camera === mode ? "active" : ""} onClick={() => setCamera(mode)}><span>0{i + 1}</span>{mode}</button>)}</div>
        <button className="back-to-map" onClick={() => setView("2D")}>回到 2D 座位图</button>
      </>}
    </section>

    <footer className="selection-bar">
      <div className="selection-mark"><MapPin size={18} /></div><div className="selection-copy"><small>{selected ? "已选位置" : "当前位置"}</small><strong>{position}</strong></div>
      {selected && <button className="clear-selection" aria-label="清除选择" onClick={() => { setSelected(null); setContentScope("venue"); }}><X size={17} /></button>}
      <button className="selection-action" onClick={openPosition}>{selected ? "更换" : "选择位置"}</button>
    </footer>
    <button
      className="stage-view-action"
      disabled={!selected}
      onClick={() => {
        if (!selected) return;
        setCamera("观众视角");
        setView("3D");
      }}
    >从这里看舞台</button>
    {contentSection}
    </> : tab === "onsite" ? <section className="standalone-page onsite-page" aria-label="在现场">
      <div className="standalone-heading"><div><p className="section-kicker">LIVE / ON SITE</p><h1>在现场</h1><p>示例照片与观众感受，帮你提前认识现场。</p></div><div className="standalone-icon"><Camera size={21} /></div></div>
      <div className="onsite-context"><button onClick={() => setSheet("venue")}>{venue.name} <ChevronDown size={14} /></button><select aria-label="在现场场次" value={contentShow} onChange={(event) => setContentShow(event.target.value)}><option>当前场次</option><option>全部场次</option>{showOptions}</select></div>
      <div className="onsite-kind"><div className="segmented kind-toggle">{(["all", "photo", "feeling"] as ContentKind[]).map((kind) => <button key={kind} className={contentKind === kind ? "active" : ""} onClick={() => setContentKind(kind)}>{kind === "all" ? "全部" : kind === "photo" ? "照片" : "感受"}</button>)}</div><select aria-label="在现场标签" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option>全部标签</option>{contentTags.map((tag) => <option key={tag}>{tag}</option>)}</select></div>
      <div className="onsite-scope"><button className={contentScope === "venue" ? "active" : ""} onClick={() => setContentScope("venue")}>全馆实拍</button><button className={contentScope === "section" ? "active" : ""} onClick={() => setContentScope("section")}>同区实拍</button><button className={contentScope === "seat" ? "active" : ""} disabled={!selected} onClick={() => setContentScope("seat")}>该位置实拍</button></div>
      {visibleContent.length ? <div className="content-list onsite-list">{visibleContent.map(renderContentCard)}</div> : <div className="content-empty standalone-empty"><ImagePlus size={25} /><strong>当前条件暂无实拍</strong><p>你可以上传第一张现场照片，帮助其他观众判断视野。</p><button className="primary-action" onClick={() => openComposer("photo")}>上传实拍</button></div>}
      <div className="onsite-actions"><button className="primary-action" onClick={() => openComposer("photo")}><ImagePlus size={16} />上传实拍</button><button className="secondary-action" onClick={() => openComposer("feeling")}><Send size={15} />分享感受</button></div>
    </section> : <section className="standalone-page me-page" aria-label="我的">
      <div className="standalone-heading"><div><p className="section-kicker">YOUR LIVERSE</p><h1>我的</h1><p>管理你的现场分享和公开署名。</p></div><div className="standalone-icon"><UserRound size={21} /></div></div>
      <div className="profile-card"><div className="profile-avatar">热</div><div><strong>{defaultName}</strong><small>访客 · 投稿仅保存在本机</small></div></div>
      <div className="submission-summary"><div><strong>{submittedItems.length}</strong><small>我的投稿</small></div><div><strong>{submittedItems.filter((item) => item.kind === "photo").length}</strong><small>实拍</small></div><div><strong>{submittedItems.filter((item) => item.kind === "feeling").length}</strong><small>感受</small></div></div>
      <div className="my-section-heading"><h2>投稿记录</h2><span>本机演示</span></div>
      {submittedItems.length ? <div className="my-submissions">{submittedItems.map((item) => <article key={item.id} className="submission-row">{item.photoCount > 0 ? <SubmissionPhoto id={item.id} /> : <div className="submission-placeholder"><Send size={16} /></div>}<div><strong>{item.kind === "photo" ? "实拍投稿" : "感受投稿"}</strong><small>{item.show} · {contentLocation(item)}</small></div><span className={`status-pill ${item.state}`}>待审核</span></article>)}</div> : <div className="my-empty"><UserRound size={23} /><strong>还没有投稿记录</strong><p>去“在现场”上传照片或分享感受。</p><button className="text-button" onClick={() => setTab("onsite")}>去在现场</button></div>}
      <div className="my-links"><button>隐私与数据管理 <ChevronRight size={15} /></button><button>反馈与举报进度 <ChevronRight size={15} /></button></div>
    </section>}
    <nav className="bottom-nav" aria-label="主导航"><button className={tab === "look" ? "active" : ""} onClick={() => setTab("look")}><MapPin size={18} /><span>看视野</span></button><button className={tab === "onsite" ? "active" : ""} onClick={() => setTab("onsite")}><Camera size={18} /><span>在现场</span></button><button className={tab === "me" ? "active" : ""} onClick={() => setTab("me")}><UserRound size={18} /><span>我的</span></button></nav>

    {sheet && <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheet(null); }}>
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-label={sheet === "venue" ? "选择场馆" : sheet === "show" ? "选择场次" : "选择位置"}>
        <div className="sheet-handle" /><div className="sheet-heading"><div><small>{venue.name}</small><h2>{sheet === "venue" ? "选择场馆" : sheet === "show" ? "选择场次" : "选择位置"}</h2></div><button aria-label="关闭" onClick={() => setSheet(null)}><X size={18} /></button></div>
        {sheet === "venue" && <div className="choice-list"><button className="choice-row chosen" onClick={() => setSheet(null)}><span className="choice-icon"><MapPin size={18} /></span><span><strong>{venue.name}</strong><small>{venue.subtitle}</small></span><Check size={17} /></button></div>}
        {sheet === "show" && <div className="choice-list">{shows.map(({ id, name: item }) => <button key={item} className={`choice-row ${show === item ? "chosen" : ""}`} onClick={() => { setShow(item); setSheet(null); }}><span className="choice-index">{id}</span><span><strong>{item}</strong><small>演示场次 · 全坐席{totalSeats}</small></span>{show === item && <Check size={17} />}</button>)}</div>}
        {sheet === "position" && <div className="position-form"><label>楼层<div className="form-segment">{(["1F", "2F"] as const).map((item) => <button key={item} className={positionFloor === item ? "active" : ""} onClick={() => { setPositionFloor(item); setPositionRow(1); setPositionNumber(1); }}>{item} {item === "1F" ? "一楼" : "二楼"}</button>)}</div></label><div className="form-fields"><label>排号<select id="row-select" value={positionRow} onChange={(event) => { setPositionRow(Number(event.target.value)); setPositionNumber(1); }}>{positionRows.map((row) => <option key={row} value={row}>{row} 排</option>)}</select></label><label>座号<select id="seat-select" value={positionNumber} onChange={(event) => setPositionNumber(Number(event.target.value))}>{positionSeats.map((seat) => <option key={seat.number} value={seat.number}>{seat.number} 号</option>)}</select></label></div><button className="confirm-position" onClick={() => { const candidate = positionSeats.find((seat) => seat.number === positionNumber); if (candidate) { setFloor(positionFloor); selectSeat(candidate); } setSheet(null); }}>确认位置 <Check size={17} /></button><button className="map-picker-link" onClick={() => { setView("2D"); setSheet(null); }}>回到 2D 座位图选择</button></div>}
      </section>
    </div>}
    {composer && <div className="sheet-backdrop composer-backdrop" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) closeComposer(); }}>
      <section className="bottom-sheet composer-sheet" role="dialog" aria-modal="true" aria-label={composer === "photo" ? "上传实拍" : "分享感受"}>
        <div className="sheet-handle" /><div className="sheet-heading"><div><small>{venue.name} · 在现场</small><h2>{composer === "photo" ? "上传实拍" : "分享感受"}</h2></div><button aria-label="关闭" disabled={saving} onClick={closeComposer}><X size={18} /></button></div>
        {selected && <p className="composer-context">已从当前视图带入位置：{position}<br /><small>请确认这是实际拍摄位置，必要时可在下面修改。</small></p>}
        <div className="composer-fields">
          <label>场馆<strong className="field-value">{venue.name}</strong></label>
          <label>演出场次<select value={eventProposal ? "" : draftShow} onChange={(event) => { setEventProposal(false); setDraftShow(event.target.value); }} disabled={eventProposal}><option value="">请选择场次</option>{showOptions}</select></label>
          <button className="event-proposal-toggle" type="button" onClick={() => setEventProposal((value) => !value)}>{eventProposal ? "返回场次列表" : "找不到演出？申请补录"}</button>
          {eventProposal && <div className="proposal-fields"><label>演出名称<input value={proposalName} onChange={(event) => setProposalName(event.target.value)} placeholder="填写演出名称" /></label><label>演出日期<input type="date" value={proposalDate} onChange={(event) => setProposalDate(event.target.value)} /></label></div>}
          <label>实际拍摄分区<select value={draftSection} onChange={(event) => setDraftSection(event.target.value)}><option value="">请选择分区</option>{sectionOptions.map((section) => <option key={section}>{section}</option>)}</select></label>
          <div className="composer-grid"><label>楼层<select value={draftFloor} onChange={(event) => setDraftFloor(event.target.value as Floor)}><option>1F</option><option>2F</option></select></label><label>排号（选填）<input inputMode="numeric" value={draftRow} onChange={(event) => setDraftRow(event.target.value)} placeholder="如 3" /></label><label>座位号（选填）<input inputMode="numeric" value={draftSeat} onChange={(event) => setDraftSeat(event.target.value)} placeholder="如 12" /></label></div>
          {composer === "photo" && <><label className="photo-picker"><span><ImagePlus size={18} />添加现场照片</span><small>最多 4 张 · 单张不超过 20 MB</small><input aria-label="选择现场照片" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={choosePhotos} /></label>{draftPhotos.length > 0 && <div className="draft-photo-list">{draftPhotos.map((photo) => <div key={photo.id}><DraftPreview photo={photo.file} /><button type="button" aria-label={`删除${photo.file.name}`} onClick={() => setDraftPhotos((items) => items.filter((item) => item.id !== photo.id))}><X size={13} /></button></div>)}</div>}</>}
          <label>视角标签（选填）<div className="tag-picker">{contentTags.map((tag) => <button type="button" key={tag} className={draftTags.includes(tag) ? "active" : ""} onClick={() => setDraftTags((tags) => tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag])}>{tag}</button>)}</div></label>
          <label>{composer === "photo" ? "照片备注（选填）" : "现场感受"}<textarea maxLength={300} value={draftNote} onChange={(event) => setDraftNote(event.target.value)} placeholder={composer === "photo" ? "补充说明现场视野或拍摄条件" : "说说你在现场的真实感受"} /></label>
          <label>署名（选填）<input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="默认：热心观众" /></label>
          <label className="consent-row"><input type="checkbox" checked={draftConsent} onChange={(event) => setDraftConsent(event.target.checked)} />我确认内容为本人拍摄／记录，并同意审核通过后公开</label>
          {submitError && <p className="composer-error" role="alert">{submitError}</p>}
          <button className="confirm-position" disabled={saving} onClick={submitComposer}>提交{composer === "photo" ? "实拍" : "感受"} <Send size={16} /></button>
          <p className="composer-note">演示记录保存在本机，提交后显示模拟待审核状态。</p>
        </div>
      </section>
    </div>}
    <div className="safe-bottom" />
    </>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
