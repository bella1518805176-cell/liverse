import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { demoLayout } from "../fixtures/beijing-demo";
if (process.env.NODE_ENV === "production")
  throw new Error("Development seed is forbidden in production");
const db = new PrismaClient();
const layout = demoLayout();
await db.venue.upsert({
  where: { id: "beijing" },
  create: { id: "beijing", name: "北京 LIVERSE", currentLayoutId: layout.id },
  update: {},
});
await db.layoutVersion.upsert({
  where: { id: layout.id },
  create: {
    id: layout.id,
    venueId: layout.venueId,
    status: "published",
    data: JSON.parse(JSON.stringify(layout)),
  },
  update: {},
});
console.log(
  "Development layout seeded; no user content, events or admin credentials created.",
);
await db.$disconnect();
