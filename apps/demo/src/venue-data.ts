import placement from "./mock/shanghai-3d-placement-estimate.json";
import mock from "./mock/shanghai.json";

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
  obstructed: seat.obstructed_2f_source_mark || (seat.floor === "1F" && seat.row >= mock.model.obstructed1FFirstRow),
}));
export const modelSeatCounts = {
  "1F": modelSeats.filter((seat) => seat.floor === "1F").length,
  "2F": modelSeats.filter((seat) => seat.floor === "2F").length,
};

export function findModelSeat(ref: SeatRef | null) {
  return ref ? modelSeats.find((seat) => seat.floor === ref.floor && seat.row === ref.row && seat.number === ref.number) : undefined;
}

export const modelSpec = { ...mock.model, target: mock.model.target as [number, number, number] };
