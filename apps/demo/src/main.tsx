import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, ChevronDown, ChevronLeft, ChevronUp, CircleHelp, MapPin, Minus, Plus, RotateCcw, X } from "lucide-react";
import "./style.css";

type Floor = "1F" | "2F";
type Sheet = "venue" | "show" | "position" | null;
type CameraMode = "场馆总览" | "观众视角" | "手机取景";
type Seat = { floor: Floor; area: string; row: number; number: number; x: number; y: number };

const fixedRows = [
  [6, 23], [9, 17, 8], [10, 17, 10], [10, 17, 10], [11, 17, 11], [11, 17, 11],
  [11, 17, 11], [11, 17, 11], [11, 17, 11], [10, 17, 10], [6, 17, 6], [5, 5],
].map((groups, index) => ({ groups, row: index + 1 }));

function buildSeats(floor: Floor): Seat[] {
  if (floor === "2F") {
    return fixedRows.flatMap(({ groups, row }) => {
      const seats: Seat[] = [];
      let number = 1;
      groups.forEach((count, groupIndex) => {
        for (let i = 0; i < count; i += 1) {
          const total = groups.reduce((sum, group) => sum + group, 0);
          const x = 500 + (number - (total + 1) / 2) * 20 + groupIndex * 24;
          seats.push({ floor, area: "固定坐席", row, number, x, y: 118 + row * 34 });
          number += 1;
        }
      });
      return seats;
    });
  }
  return [
    ...Array.from({ length: 12 }, (_, i) => ({ row: i + 1, count: 38, area: "前区", y: 150 + i * 25 })),
    ...Array.from({ length: 7 }, (_, i) => ({ row: i + 13, count: 31, area: "中区", y: 510 + i * 27 })),
  ].flatMap(({ row, count, area, y }) => Array.from({ length: count }, (_, i) => {
    const gap = area === "前区" ? 42 : 18;
    const splitAt = Math.ceil(count / 2);
    const x = 500 + (i - (count - 1) / 2) * 18 + (i >= splitAt ? gap : 0);
    return { floor, area, row, number: i + 1, x, y };
  }));
}

function App() {
  const [floor, setFloor] = useState<Floor>("1F");
  const [positionFloor, setPositionFloor] = useState<Floor>("1F");
  const [positionRow, setPositionRow] = useState(1);
  const [positionNumber, setPositionNumber] = useState(1);
  const [view, setView] = useState<"2D" | "3D">("2D");
  const [camera, setCamera] = useState<CameraMode>("场馆总览");
  const [show, setShow] = useState("演示场次 A");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selected, setSelected] = useState<Seat | null>(null);
  const [zoom, setZoom] = useState(1);
  const seats = useMemo(() => buildSeats(floor), [floor]);
  const changeFloor = (next: Floor) => {
    setFloor(next);
    if (selected?.floor !== next) setSelected(null);
    setZoom(1);
  };
  const position = selected ? `上海 LIVERSE · ${selected.floor}${selected.area} · ${selected.row}排${selected.number}号` : "尚未选择位置";
  const openPosition = () => {
    const targetFloor = selected?.floor ?? floor;
    setPositionFloor(targetFloor);
    setPositionRow(selected?.floor === targetFloor ? selected.row : 1);
    setPositionNumber(selected?.floor === targetFloor ? selected.number : 1);
    setSheet("position");
  };
  const positionRows = Array.from(new Set(buildSeats(positionFloor).map((seat) => seat.row)));
  const positionSeats = buildSeats(positionFloor).filter((seat) => seat.row === positionRow);

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark">L<span>·</span></div>
      <button className="context-button venue-choice" onClick={() => setSheet("venue")} aria-label="选择场馆">
        <span className="venue-pin"><MapPin size={15} /></span><span><strong>上海 LIVERSE</strong><small>上海 · 音宇宙艺术中心</small></span><ChevronDown size={15} />
      </button>
      <button className="context-button show-choice" onClick={() => setSheet("show")} aria-label="选择场次">
        <span><small>当前场次</small><strong>{show}</strong></span><ChevronDown size={15} />
      </button>
      <div className="mini-capsule"><span>···</span><i /><span className="capsule-ring" /></div>
    </header>

    <section className="page-heading">
      <div><p className="eyebrow">SEATING EXPLORER <span>上海</span></p><h1>找到你的现场位置</h1></div>
      <div className="current-layout"><span className="layout-dot" /><div><strong>全坐席（有过道）1184</strong><small>{show} · 演示场次</small></div><CircleHelp size={16} /></div>
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
        <div className="map-meta"><span>{floor} · {floor === "1F" ? "场次座位布局" : "固定坐席"}</span><span className="map-count">{floor === "1F" ? "673 个座位 · 站席 200 人" : "408 个已读取座位"}</span></div>
        <div className="map-stage" aria-label={`${floor} 座位图`}>
          <div className={`map-transform ${zoom >= 1.4 ? "zoomed" : ""}`} style={{ transform: `scale(${zoom})` }}>
            <svg viewBox={floor === "1F" ? "0 0 1000 920" : "0 0 1000 650"} role="img" aria-label={`${floor} 座位分布示意图`}>
              <defs><pattern id="map-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#edf0ee" strokeWidth="1" /></pattern></defs>
              <rect width="1000" height={floor === "1F" ? 920 : 650} fill="url(#map-grid)" />
              <path className="stage-outline" d={floor === "1F" ? "M350 47 Q500 20 650 47 L635 93 Q500 114 365 93Z" : "M350 44 Q500 20 650 44 L635 78 Q500 96 365 78Z"} />
              <text className="stage-label" x="500" y="72" textAnchor="middle">舞 台</text>
              {floor === "1F" && <>
                <text className="zone-label" x="500" y="125" textAnchor="middle">前 区</text>
                <rect className="control-zone" x="431" y="699" width="138" height="54" rx="4" />
                <text className="control-label" x="500" y="731" textAnchor="middle">控台 / 留空</text>
                <g className="standing-zone" aria-label="站席 有遮挡（200人）">
                  <rect x="280" y="787" width="440" height="112" rx="3" />
                  <text className="standing-title" x="500" y="833" textAnchor="middle">站席</text>
                  <text className="standing-note" x="500" y="860" textAnchor="middle">有遮挡（200人）</text>
                </g>
              </>}
              {floor === "2F" && <text className="zone-label" x="500" y="113" textAnchor="middle">二楼固定坐席</text>}
              {seats.map((seat) => {
                const active = selected?.floor === seat.floor && selected.row === seat.row && selected.number === seat.number;
                const x = floor === "1F" ? seat.x : seat.x;
                return <g key={`${seat.floor}-${seat.row}-${seat.number}`} className={`seat ${active ? "selected" : ""}`} role="button" tabIndex={0} aria-label={`${seat.floor}${seat.area} ${seat.row}排${seat.number}号`} onClick={() => setSelected(seat)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected(seat); }}>
                  <circle cx={x} cy={seat.y} r={floor === "1F" ? 6 : 7} /><text className="seat-number" x={x} y={seat.y + 3}>{seat.number}</text><title>{seat.row}排{seat.number}号</title>
                </g>;
              })}
              {Array.from({ length: floor === "1F" ? 19 : 12 }, (_, i) => <text key={i} className="row-label" x="130" y={floor === "1F" ? (i < 12 ? 154 + i * 25 : 514 + (i - 12) * 27) : 152 + i * 34}>{i + 1}</text>)}
              <text className="row-caption" x="102" y={floor === "1F" ? 445 : 580} transform={`rotate(-90 102 ${floor === "1F" ? 445 : 580})`}>排号</text>
            </svg>
          </div>
        </div>
        <div className="map-footer"><span><i className="legend-seat" />可选位置</span><span><i className="legend-selected" />当前选择</span><div className="map-tools"><button aria-label="缩小" onClick={() => setZoom(Math.max(0.8, zoom - 0.15))}><Minus size={15} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="放大" onClick={() => setZoom(Math.min(2.5, zoom + 0.15))}><Plus size={15} /></button><button aria-label="复位" onClick={() => setZoom(1)}><RotateCcw size={14} /></button></div></div>
        {floor === "1F" && <div className="data-note"><span>!</span><p>1F 中区有 7 个座位编号待核对；后区为站席示意，不展示座位点。</p><strong>数据说明</strong></div>}
      </> : <>
        <div className="map-meta"><span>3D 视图 <em>预览占位</em></span><span className="map-count">{camera}</span></div>
        <div className={`placeholder-scene scene-${camera === "手机取景" ? "camera" : camera === "观众视角" ? "audience" : "overview"}`}>
          <div className="scene-topline"><span>上海 LIVERSE</span><span>MODEL / NOT CONNECTED</span></div>
          <div className="scene-symbol"><div className="scene-ring ring-one" /><div className="scene-ring ring-two" /><div className="scene-center">{camera === "手机取景" ? "取景框" : camera === "观众视角" ? "观众视角" : "场馆总览"}</div></div>
          <p className="scene-title">{camera}</p><p className="scene-description">3D 模型暂未接入</p>
          {camera === "手机取景" && <div className="viewfinder"><span /><span /><span /><span /></div>}
          <div className="scene-location">{selected ? <><MapPin size={14} />{position}</> : <>选择一个位置以继续</>}</div>
        </div>
        <div className="camera-modes">{(["场馆总览", "观众视角", "手机取景"] as CameraMode[]).map((mode, i) => <button key={mode} className={camera === mode ? "active" : ""} onClick={() => setCamera(mode)}><span>0{i + 1}</span>{mode}</button>)}</div>
        <button className="back-to-map" onClick={() => setView("2D")}>回到 2D 座位图</button>
      </>}
    </section>

    <footer className="selection-bar">
      <div className="selection-mark"><MapPin size={18} /></div><div className="selection-copy"><small>{selected ? "已选位置" : "当前位置"}</small><strong>{position}</strong></div>
      {selected && <button className="clear-selection" aria-label="清除选择" onClick={() => setSelected(null)}><X size={17} /></button>}
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

    {sheet && <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheet(null); }}>
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-label={sheet === "venue" ? "选择场馆" : sheet === "show" ? "选择场次" : "选择位置"}>
        <div className="sheet-handle" /><div className="sheet-heading"><div><small>上海 LIVERSE</small><h2>{sheet === "venue" ? "选择场馆" : sheet === "show" ? "选择场次" : "选择位置"}</h2></div><button aria-label="关闭" onClick={() => setSheet(null)}><X size={18} /></button></div>
        {sheet === "venue" && <div className="choice-list"><button className="choice-row chosen" onClick={() => setSheet(null)}><span className="choice-icon"><MapPin size={18} /></span><span><strong>上海 LIVERSE</strong><small>上海 · 音宇宙艺术中心</small></span><Check size={17} /></button></div>}
        {sheet === "show" && <div className="choice-list">{["演示场次 A", "演示场次 B"].map((item) => <button key={item} className={`choice-row ${show === item ? "chosen" : ""}`} onClick={() => { setShow(item); setSheet(null); }}><span className="choice-index">{item.endsWith("A") ? "A" : "B"}</span><span><strong>{item}</strong><small>演示场次 · 全坐席（有过道）1184</small></span>{show === item && <Check size={17} />}</button>)}</div>}
        {sheet === "position" && <div className="position-form"><label>楼层<div className="form-segment">{(["1F", "2F"] as const).map((item) => <button key={item} className={positionFloor === item ? "active" : ""} onClick={() => { setPositionFloor(item); setPositionRow(1); setPositionNumber(1); }}>{item} {item === "1F" ? "一楼" : "二楼"}</button>)}</div></label><div className="form-fields"><label>排号<select id="row-select" value={positionRow} onChange={(event) => { setPositionRow(Number(event.target.value)); setPositionNumber(1); }}>{positionRows.map((row) => <option key={row} value={row}>{row} 排</option>)}</select></label><label>座号<select id="seat-select" value={positionNumber} onChange={(event) => setPositionNumber(Number(event.target.value))}>{positionSeats.map((seat) => <option key={seat.number} value={seat.number}>{seat.number} 号</option>)}</select></label></div><button className="confirm-position" onClick={() => { const candidate = positionSeats.find((seat) => seat.number === positionNumber); if (candidate) { setFloor(positionFloor); setSelected(candidate); } setSheet(null); }}>确认位置 <Check size={17} /></button><button className="map-picker-link" onClick={() => { setView("2D"); setSheet(null); }}>回到 2D 座位图选择</button></div>}
      </section>
    </div>}
    <div className="safe-bottom" />
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
