import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
const root = process.cwd();
process.env.CLIENT_BASE_PATH = process.env.MIAODA_APP_ID
  ? `/app/${process.env.MIAODA_APP_ID}`
  : "";
process.env.ASSETS_CDN_PATH = process.env.MIAODA_RESOURCE_CDN_PREFIX || "/";
process.env.STATIC_ASSETS_BASE_URL = process.env.MIAODA_STATIC_CDN_PREFIX || "";
process.env.NODE_ENV ||= "production";
await rm(path.join(root, "dist"), { recursive: true, force: true });
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--outDir",
    path.join(root, "dist/client"),
    "--emptyOutDir",
  ],
  { stdio: "inherit", env: process.env },
);
const status = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});
if (status !== 0) throw new Error(`Vite failed: ${status}`);
const output = path.join(root, "dist/output");
await mkdir(output, { recursive: true });
await cp(path.join(root, "public"), output, { recursive: true });
for (const name of await readdir(path.join(root, "dist/client"))) {
  if (name.endsWith(".html") || name === "routes.json")
    await cp(path.join(root, "dist/client", name), path.join(output, name));
}
await mkdir(path.join(root, "dist/output_resource"), { recursive: true });
await cp(
  path.join(root, "dist/client/assets"),
  path.join(root, "dist/output_resource/assets"),
  { recursive: true },
);
await cp(
  path.join(root, "shared/static"),
  path.join(root, "dist/output_static"),
  { recursive: true },
);
await cp(
  path.join(root, "shared/capabilities"),
  path.join(root, "dist/output_capabilities"),
  { recursive: true },
);
await rm(path.join(root, "dist/client"), { recursive: true, force: true });
console.log("Hosted demo built with platform output directories");
