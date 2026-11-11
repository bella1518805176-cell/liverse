import placement from "../../../docs/data/shanghai-3d-placement-estimate.json";

export type Floor = "1F" | "2F";
export type CameraMode = "场馆总览" | "观众视角" | "手机取景";
export type SeatRef = { floor: Floor; row: number; number: number };
export type ModelSeat = SeatRef & {
  id: string;
  position: [number, number, number];
  yaw: number;
  obstructed: boolean;
};

export const venueParameters = placement.parameters;
export const tierRows = placement.rows.filter((row) => row.floor === "2F");
export const modelSeats: ModelSeat[] = placement.seats.map((seat) => ({
  id: seat.id,
  floor: seat.floor as Floor,
  row: seat.row,
  number: seat.number,
  position: seat.position_m as [number, number, number],
  yaw: seat.yaw_rad,
  obstructed: seat.obstructed_2f_source_mark || (seat.floor === "1F" && seat.row >= 20),
}));

export function findModelSeat(ref: SeatRef | null) {
  return ref ? modelSeats.find((seat) => seat.floor === ref.floor && seat.row === ref.row && seat.number === ref.number) : undefined;
}

export const modelSpec = {
  floorWidth: 29.05,
  floorDepth: 29.58,
  stageHeight: 1.5,
  stageDepth: 9,
  stageWidths: [20, 17, 13],
  screenWidth: 33.28,
  screenHeight: 12,
  screenBottom: 2,
  // Installation curve and viewer eye height remain adjustable prototype assumptions.
  screenRadius: 15,
  eyeHeight: 1.2,
  target: [0, 3.6, -4.5] as [number, number, number],
};
