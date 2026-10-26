import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { mkdir } from "node:fs/promises";
import path from "node:path";
await mkdir(".local", { recursive: true });
const db = new EmbeddedPostgres({
  databaseDir: path.resolve(".local/postgres"),
  user: "liverse",
  password: "liverse",
  port: 55432,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});
try {
  await db.initialise();
} catch (e) {
  if (!String(e).includes("already")) throw e;
}
await db.start();
try {
  await db.createDatabase("liverse");
} catch (e) {
  if (!String(e).includes("already exists")) throw e;
}
console.log("PostgreSQL ready at 127.0.0.1:55432");
const stop = async () => {
  await db.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await new Promise(() => {});
