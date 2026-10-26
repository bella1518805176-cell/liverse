import { type Layout } from "../packages/contracts";
export function demoLayout(): Layout {
  const sections = [
    {
      id: "demo-floor",
      name: "开发示例 · 一层",
      floor: "示例 1F",
      x: 0,
      z: 18,
      width: 24,
      depth: 22,
    },
    {
      id: "demo-balcony",
      name: "开发示例 · 二层",
      floor: "示例 2F",
      x: 0,
      z: 28,
      width: 24,
      depth: 12,
    },
  ];
  return {
    schemaVersion: 1,
    id: "beijing-demo-v1",
    venueId: "beijing",
    name: "开发示例布局 v1",
    status: "published",
    demo: true,
    verified: false,
    source: "程序生成的交互测试数据，不代表北京 LIVERSE 的排座或尺寸",
    updatedAt: "2026-10-26",
    floors: ["示例 1F", "示例 2F"],
    sections,
    capabilities: { seats: true, model: true },
    target: { x: 0, y: 2, z: 0 },
    seats: sections.flatMap((section, level) =>
      Array.from({ length: level ? 5 : 9 }, (_, row) =>
        Array.from({ length: 18 }, (_, col) => ({
          id: `demo-${level}-${row}-${col}`,
          sectionId: section.id,
          floor: section.floor,
          rowLabel: `D${String(row + 1).padStart(2, "0")}`,
          seatLabel: String(col + 1).padStart(2, "0"),
          x: (col - 8.5) * 1.2 + (col > 8 ? 1 : -1),
          y: level ? 5 + row * 0.4 : 0,
          z: (level ? 25 : 8) + row * 2.2,
        })),
      ).flat(),
    ),
  };
}
