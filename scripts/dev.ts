import "dotenv/config";
import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--import", "tsx", "apps/api/src/main.ts"], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--config",
      "apps/admin/vite.config.ts",
      "--host",
      "127.0.0.1",
      "--force",
    ],
    { stdio: "inherit" },
  ),
  spawn(process.execPath, ["--import", "tsx", "apps/api/src/worker.ts"], {
    stdio: "inherit",
  }),
];
function stop() {
  for (const child of children) child.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((c) =>
  c.on("exit", (code) => {
    if (code) {
      stop();
      process.exit(code);
    }
  }),
);
