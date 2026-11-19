import mock from "./mock/shanghai.json";
import type { Floor } from "./venue-data";

export type Seat = { floor: Floor; area: string; row: number; number: number; x: number; y: number; obstructed?: boolean };
export type ContentScope = "seat" | "section" | "venue";
export type ContentItem = {
  id: string;
  kind: "photo" | "feeling";
  scope: ContentScope;
  floor?: Floor;
  area?: string;
  row?: number;
  number?: number;
  show: string;
  text: string;
  tags: string[];
  displayName: string;
  photo?: string;
  state: "published" | "pending" | "rejected";
};

// Mock data boundary: replace the JSON reads here with API responses when available.
export const { venue, shows, contentTags, sectionOptions, layout } = mock;
export const demoContent = mock.content as ContentItem[];

// Map rows into interactive coordinates while keeping geometry in the mock source.
const first = layout["1F"];
const second = layout["2F"];
const obstructionIds = new Set(second.obstructed.map(([row, number]) => `${row}-${number}`));
const seatsByFloor: Record<Floor, Seat[]> = {
  "1F": first.sections.flatMap((section) => Array.from({ length: section.rows }, (_, index) =>
    Array.from({ length: section.seats }, (_, i): Seat => {
      const blockSize = section.seats / 2;
      const x = section.starts
        ? section.starts[Number(i >= blockSize)] + (i % blockSize) * first.seatSpacing
        : section.center! + (i - (section.seats - 1) / 2) * first.seatSpacing;
      return { floor: "1F", area: section.area, row: section.firstRow + index, number: i + 1, x, y: section.y + index * section.dy };
    }),
  ).flat()),
  "2F": second.groups.flatMap((groups, index) => {
    const row = index + 1;
    let number = 0;
    return groups.flatMap((count, block) => Array.from({ length: count }, (_, i): Seat => {
      number++;
      // Right-align the left block; an empty middle block keeps the right anchor intact.
      const x = second.anchors[block] + (block === 0 ? i - count + 1 : i) * second.seatSpacing;
      return { floor: "2F", area: second.area, row, number, x, y: second.y + index * second.dy, obstructed: obstructionIds.has(`${row}-${number}`) };
    }));
  }),
};
export const getSeats = (floor: Floor) => seatsByFloor[floor];
export const seatCounts = { "1F": seatsByFloor["1F"].length, "2F": seatsByFloor["2F"].length };
export const mapRows = (floor: Floor) => getSeats(floor).filter((seat) => seat.number === 1);
export const totalSeats = seatCounts["1F"] + seatCounts["2F"];
