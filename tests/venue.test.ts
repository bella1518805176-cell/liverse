import { describe, it, expect } from "vitest";
import { demoLayout } from "../fixtures/beijing-demo";
import {
  validatePosition,
  validateContribution,
  positionKey,
  type PositionRef,
} from "../packages/contracts";
import {
  addCompare,
  cameraAt,
  fitMap,
  project,
  unproject,
  searchSeat,
  validateLayout,
  buildSeatIndex,
  resolvePosition,
  sharePath,
} from "../packages/venue-core";
const layout = demoLayout();
const a: PositionRef = {
  venueId: layout.venueId,
  layoutVersionId: layout.id,
  kind: "seat",
  seatId: layout.seats[0].id,
};
const b = { ...a, seatId: layout.seats[1].id };
describe("position and layout contracts", () => {
  it("rejects fabricated precision and retains string labels", () => {
    expect(validatePosition({ ...a, sectionId: "wrong" })).toBe(false);
    expect(validatePosition({ ...a, kind: "venue" })).toBe(false);
    expect(searchSeat(layout, "示例 1F", "demo-floor", "D01", "01")?.id).toBe(
      a.seatId,
    );
    expect(
      searchSeat(layout, "示例 1F", "demo-floor", "D1", "1"),
    ).toBeUndefined();
    expect(
      searchSeat(layout, "示例 2F", "demo-floor", "D01", "01"),
    ).toBeUndefined();
  });
  it("refuses mismatched versions and section ownership", () => {
    expect(() =>
      resolvePosition(layout, { ...a, layoutVersionId: "other" }),
    ).toThrow();
    const invalid = structuredClone(layout);
    invalid.seats[0].floor = "示例 2F";
    expect(validateLayout(invalid)).not.toHaveLength(0);
    invalid.seats[0].x = Infinity;
    expect(validateLayout(invalid)).not.toHaveLength(0);
  });
  it("isolates development assets from production publication", () => {
    expect(validateLayout(layout)).toEqual([]);
    expect(validateLayout(layout, true)).toContain(
      "正式发布需要已核验的非示例资料",
    );
  });
  it("rejects seats for region-only layouts", () => {
    const regions = {
      ...layout,
      capabilities: { seats: false, model: false },
      seats: [],
    };
    expect(
      searchSeat(regions, "示例 1F", "demo-floor", "D01", "01"),
    ).toBeUndefined();
    expect(() => resolvePosition(regions, a)).toThrow();
  });
});
describe("map and camera consistency", () => {
  it("inverts pan/zoom without mirroring axes", () => {
    const t = { ...fitMap(390, 500), scale: 17, offsetX: 83, offsetY: -19 };
    for (const s of layout.seats) {
      const p = project(s.x, s.z, t),
        world = unproject(p.x, p.y, t);
      expect(world.x).toBeCloseTo(s.x);
      expect(world.z).toBeCloseTo(s.z);
    }
  });
  it("spatial index respects floors and does not choose distant seats", () => {
    const index = buildSeatIndex(layout.seats),
      s = layout.seats[0];
    expect(index(s.x, s.z, s.floor)?.id).toBe(s.id);
    expect(index(1000, 1000, s.floor)).toBeUndefined();
    expect(index(s.x, s.z, "示例 2F")).toBeUndefined();
  });
  it("adds eye height exactly once to the shared seat coordinate", () => {
    const p: PositionRef = { ...a, seatId: layout.seats.at(-1)!.id };
    const s = layout.seats.at(-1)!;
    expect(cameraAt(layout, p, false).position.y).toBe(s.y + 1.2);
    expect(cameraAt(layout, p, true).position.y).toBe(s.y + 1.65);
    expect(cameraAt(layout, a, false).fov).toBe(cameraAt(layout, p, false).fov);
  });
  it("round-trips only public position references in share links", () => {
    const raw = decodeURIComponent(sharePath(a).split("position=")[1]);
    expect(JSON.parse(raw)).toEqual(a);
    expect(raw).not.toContain("token");
  });
});
describe("comparison and submission invariants", () => {
  it("deduplicates, requires explicit replacement and rejects cross-version comparisons", () => {
    const pair = addCompare(addCompare([], a), b);
    expect(addCompare(pair, a)).toEqual(pair);
    const c = { ...a, seatId: layout.seats[2].id };
    expect(() => addCompare(pair, c)).toThrow("请选择替换");
    expect(addCompare(pair, c, 1)).toEqual([a, c]);
    expect(() => addCompare([a], { ...b, layoutVersionId: "v2" })).toThrow(
      "同一布局",
    );
    expect(positionKey(a)).not.toBe(
      positionKey({ ...a, layoutVersionId: "v2" }),
    );
  });
  it("enforces explicit consent, content, tags and image limits", () => {
    const valid = {
      position: a,
      text: "现场记录",
      tags: [],
      mediaIds: [],
      consent: true,
      displayName: "观众",
    };
    expect(validateContribution(valid)).toBe(true);
    for (const change of [
      { consent: false },
      { text: "   " },
      { text: "a".repeat(301) },
      { mediaIds: ["1", "2", "3", "4", "5"] },
      { tags: ["虚构评分"] },
    ])
      expect(validateContribution({ ...valid, ...change })).toBe(false);
  });
  it("accepts the live submission vocabulary and event proposals", () => {
    const feeling = {
      position: { venueId: a.venueId, layoutVersionId: a.layoutVersionId, kind: "section" as const, sectionId: layout.sections[0].id },
      text: "现场距离适中",
      tags: ["无遮挡", "屏看得清楚"],
      mediaIds: [],
      consent: true,
      displayName: "",
      contentType: "feeling" as const,
      eventProposal: { name: "未收录演出", date: "2026-12-08" },
    };
    expect(validateContribution(feeling)).toBe(true);
    expect(validateContribution({ ...feeling, tags: ["现场氛围"] })).toBe(false);
    expect(validateContribution({ ...feeling, eventProposal: { name: "演出", date: "12/08/2026" } })).toBe(false);
  });
});
