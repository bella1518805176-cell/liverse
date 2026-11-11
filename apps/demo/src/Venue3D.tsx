import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, Scan } from "lucide-react";
import { createVenueScene, type VisibleFloor } from "./venue-scene";
import { findModelSeat, type CameraMode, type ModelSeat, type SeatRef } from "./venue-data";

type Props = { mode: CameraMode; selected: SeatRef | null; position: string; onSelect: (seat: ModelSeat) => void; onChoose: () => void; onMap: () => void };

export default function Venue3D({ mode, selected, position, onSelect, onChoose, onMap }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ReturnType<typeof createVenueScene> | null>(null);
  const pick = useRef(onSelect); pick.current = onSelect;
  const [visibleFloor, setVisibleFloor] = useState<VisibleFloor>("all");
  const [lens, setLens] = useState<1 | 2>(1);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const state = useRef({ mode, selected, floor: visibleFloor, lens });
  state.current = { mode, selected, floor: visibleFloor, lens };
  const modelSeat = findModelSeat(selected);
  const audience = mode !== "场馆总览";

  useEffect(() => {
    if (!canvas.current) return;
    let instance: ReturnType<typeof createVenueScene> | null = null;
    setError(false);
    try {
      instance = createVenueScene(canvas.current, (seat) => pick.current(seat), () => setError(true));
      instance.update(state.current);
      engine.current = instance;
    } catch { setError(true); }
    return () => { instance?.dispose(); engine.current = null; };
  }, [attempt]);

  useEffect(() => { engine.current?.update({ mode, selected, floor: visibleFloor, lens }); }, [mode, selected, visibleFloor, lens, attempt]);

  return <>
    <div className="venue-scene-wrap" data-mode={mode}>
      <canvas key={attempt} ref={canvas} className="venue-canvas" tabIndex={0} aria-label="上海 LIVERSE 三维场馆；拖动旋转，双指或滚轮缩放，可在总览点击座位" />
      <div className="scene-topline"><span>SHANGHAI / LIVERSE</span><span className="model-badge">尺寸估算模型</span></div>
      <div className="scene-heading"><p className="scene-title">{mode}</p><p>{audience && modelSeat ? `${modelSeat.floor} · ${modelSeat.row}排 ${modelSeat.number}号` : "1F 800 座 · 2F 408 座"}</p></div>
      {!audience && !error && <div className="model-layers" aria-label="模型楼层显示">
        {(["all", "1F", "2F"] as const).map((floor) => <button key={floor} aria-pressed={visibleFloor === floor} className={visibleFloor === floor ? "active" : ""} onClick={() => setVisibleFloor(floor)}>{floor === "all" ? "全馆" : `仅看 ${floor}`}</button>)}
      </div>}
      {audience && !selected && !error && <div className="scene-empty"><strong>先选择一个观演位置</strong><p>从座位出发，看看舞台的方向与距离</p><button onClick={onChoose}>选择位置</button></div>}
      {error && <div className="scene-empty scene-error" role="alert"><strong>3D 暂时无法显示</strong><p>浏览器图形渲染不可用，可重试或回到座位图。</p><button onClick={() => setAttempt((n) => n + 1)}>重新加载3D</button><button className="secondary" onClick={onMap}>回到2D选座</button></div>}
      {mode === "手机取景" && selected && !error && <><div className="viewfinder" aria-label="模拟手机取景框"><span /><span /><span /><span /></div><div className="lens-controls" aria-label="模拟焦段">{([1, 2] as const).map((value) => <button key={value} className={lens === value ? "active" : ""} aria-pressed={lens === value} onClick={() => setLens(value)}>{value}×</button>)}</div></>}
      <div className="scene-location">{selected ? position : "尚未选择位置 · 点击座位或使用选位置"}</div>
    </div>
    {!error && <div className="model-toolbar">
      <span>{mode === "场馆总览" ? "拖动旋转 · 双指缩放 · 点击选座" : selected ? "拖动环顾 · 坐姿眼高 1.2m（示意）" : "选好位置后查看舞台"}</span>
      <div>{mode === "场馆总览" && <><button aria-label="3D缩小" onClick={() => engine.current?.zoom(1.15)}><Minus size={15} /></button><button aria-label="3D放大" onClick={() => engine.current?.zoom(0.85)}><Plus size={15} /></button><button aria-label="3D俯视" onClick={() => engine.current?.topView()}><Scan size={15} /></button></>}<button aria-label="3D复位" onClick={() => { setLens(1); engine.current?.reset(); }}><RotateCcw size={14} /></button></div>
    </div>}
    <div className="model-note">尺寸估算预览 · 1F 椅距 560 / 排距 900mm · 2F 阶高 495 / 进深 900mm{mode === "手机取景" ? " · 模拟取景，非实拍" : ""}</div>
  </>;
}
