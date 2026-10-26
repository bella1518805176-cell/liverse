import {
  type Layout,
  type PositionRef,
  type Seat,
  positionKey,
} from "../contracts";
export type MapTransform = { scale: number; offsetX: number; offsetY: number };
export const project = (x: number, z: number, t: MapTransform) => ({
  x: x * t.scale + t.offsetX,
  y: z * t.scale + t.offsetY,
});
export const unproject = (x: number, y: number, t: MapTransform) => ({
  x: (x - t.offsetX) / t.scale,
  z: (y - t.offsetY) / t.scale,
});
export function fitMap(width: number, height: number): MapTransform {
  const scale = Math.min((width - 48) / 32, (height - 72) / 40);
  return { scale, offsetX: width / 2, offsetY: 40 };
}
export function validateLayout(layout: Layout, production = false): string[] {
  const errors: string[] = [];
  if (
    layout.schemaVersion !== 1 ||
    !layout.id ||
    !layout.venueId ||
    !layout.source ||
    !layout.floors?.length
  )
    errors.push("布局信息不完整");
  if (!["draft", "published", "withdrawn"].includes(layout.status))
    errors.push("布局状态无效");
  if (production && (layout.demo || !layout.verified))
    errors.push("正式发布需要已核验的非示例资料");
  const ids = new Set<string>();
  for (const section of layout.sections) {
    if (
      ids.has(section.id) ||
      !layout.floors.includes(section.floor) ||
      ![section.x, section.z, section.width, section.depth].every(
        Number.isFinite,
      ) ||
      section.width <= 0 ||
      section.depth <= 0
    )
      errors.push(`区域无效: ${section.id}`);
    ids.add(section.id);
  }
  const seats = new Set<string>();
  for (const seat of layout.seats) {
    if (
      seats.has(seat.id) ||
      !seat.rowLabel ||
      !seat.seatLabel ||
      ![seat.x, seat.y, seat.z].every(Number.isFinite) ||
      !layout.sections.some(
        (s) => s.id === seat.sectionId && s.floor === seat.floor,
      )
    )
      errors.push(`座位无效: ${seat.id}`);
    seats.add(seat.id);
  }
  if (!layout.capabilities.seats && layout.seats.length)
    errors.push("未开放逐座能力却包含座位");
  if (
    ![layout.target.x, layout.target.y, layout.target.z].every(Number.isFinite)
  )
    errors.push("相机目标无效");
  return errors;
}
export function resolvePosition(
  layout: Layout,
  p: PositionRef,
): Seat | { x: number; y: number; z: number } {
  if (p.layoutVersionId !== layout.id || p.venueId !== layout.venueId)
    throw new Error("位置不属于当前布局");
  if (p.kind === "seat") {
    const s = layout.seats.find((s) => s.id === p.seatId);
    if (!s || !layout.capabilities.seats) throw new Error("座位不存在");
    return s;
  }
  if (p.kind === "section") {
    const s = layout.sections.find((s) => s.id === p.sectionId);
    if (!s) throw new Error("区域不存在");
    return { x: s.x, y: 0, z: s.z };
  }
  return { x: 0, y: 0, z: 20 };
}
export function positionLabel(layout: Layout, p: PositionRef): string {
  if (p.kind === "venue") return "整个场馆";
  if (p.kind === "section")
    return (
      layout.sections.find((s) => s.id === p.sectionId)?.name ?? "区域不可用"
    );
  const s = layout.seats.find((s) => s.id === p.seatId);
  return s ? `${s.floor} · ${s.rowLabel} 排 ${s.seatLabel} 号` : "位置不可用";
}
export function searchSeat(
  layout: Layout,
  floor: string,
  sectionId: string,
  row: string,
  seat: string,
): Seat | undefined {
  if (!layout.capabilities.seats) return undefined;
  return layout.seats.find(
    (s) =>
      s.floor === floor &&
      s.sectionId === sectionId &&
      s.rowLabel === row.trim() &&
      s.seatLabel === seat.trim(),
  );
}
export function buildSeatIndex(seats: Seat[]) {
  const cells = new Map<string, Seat[]>();
  for (const s of seats) {
    const key = `${Math.floor(s.x / 2)},${Math.floor(s.z / 2)}`;
    const cell = cells.get(key) ?? [];
    cell.push(s);
    cells.set(key, cell);
  }
  return (x: number, z: number, floor: string, radius = 0.6) => {
    let nearest: Seat | undefined;
    let distance = radius;
    for (
      let cx = Math.floor((x - radius) / 2);
      cx <= Math.floor((x + radius) / 2);
      cx++
    )
      for (
        let cz = Math.floor((z - radius) / 2);
        cz <= Math.floor((z + radius) / 2);
        cz++
      ) {
        for (const s of cells.get(`${cx},${cz}`) ?? []) {
          const d = Math.hypot(s.x - x, s.z - z);
          if (s.floor === floor && d < distance) {
            nearest = s;
            distance = d;
          }
        }
      }
    return nearest;
  };
}
export function addCompare(
  current: PositionRef[],
  next: PositionRef,
  replace?: number,
): PositionRef[] {
  if (current.some((p) => positionKey(p) === positionKey(next))) return current;
  if (
    current.some(
      (p) =>
        p.layoutVersionId !== next.layoutVersionId ||
        p.venueId !== next.venueId,
    )
  )
    throw new Error("请选择同一布局版本的位置");
  if (current.length < 2) return [...current, next];
  if (replace !== 0 && replace !== 1) throw new Error("请选择替换 A 或 B");
  return current.map((p, i) => (i === replace ? next : p));
}
export function cameraAt(layout: Layout, p: PositionRef, standing: boolean) {
  const point = resolvePosition(layout, p);
  return {
    position: { x: point.x, y: point.y + (standing ? 1.65 : 1.2), z: point.z },
    target: layout.target,
    fov: 60,
  };
}
export function sharePath(p: PositionRef): string {
  return `/subpackages/venue/preview/index?position=${encodeURIComponent(JSON.stringify(p))}`;
}
