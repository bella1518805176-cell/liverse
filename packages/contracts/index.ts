import Ajv from "ajv";

export type PositionRef = { venueId: string; layoutVersionId: string } & (
  | { kind: "seat"; seatId: string }
  | { kind: "section"; sectionId: string }
  | { kind: "venue" }
);
export type Seat = {
  id: string;
  sectionId: string;
  floor: string;
  rowLabel: string;
  seatLabel: string;
  x: number;
  y: number;
  z: number;
};
export type Section = {
  id: string;
  name: string;
  floor: string;
  x: number;
  z: number;
  width: number;
  depth: number;
};
export type Layout = {
  schemaVersion: 1;
  id: string;
  venueId: string;
  name: string;
  status: "draft" | "published" | "withdrawn";
  demo: boolean;
  verified: boolean;
  source: string;
  updatedAt: string;
  floors: string[];
  sections: Section[];
  seats: Seat[];
  capabilities: { seats: boolean; model: boolean };
  target: { x: number; y: number; z: number };
};
export type ContentState =
  | "pending"
  | "published"
  | "rejected"
  | "withdrawn"
  | "deleted";
export type ContributionInput = {
  position: PositionRef;
  eventId?: string;
  text: string;
  tags: string[];
  mediaIds: string[];
  consent: boolean;
  displayName: string;
  contentType?: "photo" | "feeling";
  eventProposal?: { name: string; date: string };
  device?: string;
  zoom?: string;
  shotDate?: string;
};
export type PublicContent = {
  id: string;
  position: PositionRef;
  eventId: string | null;
  text: string;
  tags: string[];
  displayName: string;
  source: "official" | "user";
  state: ContentState;
  createdAt: string;
  mediaIds: string[];
  helpfulCount: number;
  device?: string;
  zoom?: string;
  shotDate?: string;
  revision: number;
  contentType?: "photo" | "feeling";
  eventProposal?: { name: string; date: string };
};
export type Ticket = {
  id: string;
  category: string;
  text: string;
  targetId: string | null;
  status: string;
  reply: string;
  createdAt: string;
  revision: number;
};
export type ApiError = { code: string; message: string; requestId: string };

export const positionSchema = {
  type: "object",
  required: ["venueId", "layoutVersionId", "kind"],
  additionalProperties: false,
  properties: {
    venueId: { type: "string", minLength: 1, maxLength: 100 },
    layoutVersionId: { type: "string", minLength: 1, maxLength: 100 },
    kind: { enum: ["seat", "section", "venue"] },
    seatId: { type: "string", minLength: 1, maxLength: 100 },
    sectionId: { type: "string", minLength: 1, maxLength: 100 },
  },
  oneOf: [
    {
      properties: { kind: { const: "seat" } },
      required: ["seatId"],
      not: { required: ["sectionId"] },
    },
    {
      properties: { kind: { const: "section" } },
      required: ["sectionId"],
      not: { required: ["seatId"] },
    },
    {
      properties: { kind: { const: "venue" } },
      not: { anyOf: [{ required: ["seatId"] }, { required: ["sectionId"] }] },
    },
  ],
} as const;
const string = (maxLength: number) => ({ type: "string", maxLength });
export const contributionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["position", "text", "tags", "mediaIds", "consent", "displayName"],
  properties: {
    position: positionSchema,
    eventId: string(100),
    text: string(300),
  tags: {
      type: "array",
      maxItems: 6,
      uniqueItems: true,
      items: {
        enum: ["无遮挡", "栏杆遮挡", "音响遮挡", "屏看得清楚", "距离较远"],
      },
    },
    mediaIds: {
      type: "array",
      maxItems: 4,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 100 },
    },
    consent: { const: true },
    displayName: { type: "string", minLength: 0, maxLength: 30 },
    contentType: { enum: ["photo", "feeling"] },
    eventProposal: {
      type: "object",
      additionalProperties: false,
      required: ["name", "date"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 100 },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      },
    },
    device: string(80),
    zoom: string(30),
    shotDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
  anyOf: [
    { properties: { text: { type: "string", pattern: "\\S" } } },
    { properties: { mediaIds: { minItems: 1 } } },
  ],
} as const;
const ajv = new Ajv({ allErrors: true, strict: false });
export const validatePosition = ajv.compile<PositionRef>(positionSchema);
export const validateContribution =
  ajv.compile<ContributionInput>(contributionSchema);
export function positionKey(p: PositionRef): string {
  return [
    p.venueId,
    p.layoutVersionId,
    p.kind,
    p.kind === "seat" ? p.seatId : p.kind === "section" ? p.sectionId : "",
  ].join(":");
}
export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
