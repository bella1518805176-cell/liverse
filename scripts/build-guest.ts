import { mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["apps/guest/main.tsx"],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "inline",
  supported: { "inline-script": true, "inline-style": true },
  write: false,
  outdir: "dist/guest",
});

const script = outputFiles.find((file) => file.path.endsWith(".js"));
const style = outputFiles.find((file) => file.path.endsWith(".css"));
if (!script || !style || outputFiles.length !== 2) {
  throw new Error("Guest build must contain only JavaScript and CSS to inline");
}

const html = [
  "<!doctype html>",
  '<html lang="zh-CN">',
  "<head>",
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="theme-color" content="#0b0d10">',
  "<title>LIVERSE · 观演视野体验</title>",
  "<style>" + style.text + "</style>",
  "</head>",
  '<body><div id="root"></div>',
  "<script>" + script.text + "</script>",
  "</body></html>",
].join("\n");

await mkdir("dist/guest", { recursive: true });
await writeFile("dist/guest/index.html", html, "utf8");
console.log("Guest experience built to dist/guest/index.html");
