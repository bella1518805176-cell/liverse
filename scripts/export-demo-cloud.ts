import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const target = path.resolve(".local/liverse-demo-cloud");
const hosting = JSON.parse(await readFile("infra/demo-hosting.json", "utf8"));
const meta = JSON.parse(
  await readFile(path.join(target, ".spark/meta.json"), "utf8"),
);
if (meta.app_id !== hosting.appId && meta.appId !== hosting.appId)
  throw new Error("Hosting app ID does not match target repository");
const files = [
  "apps/admin/src/preview.tsx",
  "apps/admin/src/preview.css",
  "apps/admin/src/api.ts",
  "packages/contracts/index.ts",
  "packages/venue-core/index.ts",
  "packages/venue-renderer/index.ts",
  "fixtures/beijing-demo.ts",
  "apps/demo/src/style.css",
];
for (const file of files) {
  const destination = path.join(target, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(file, destination);
}
await writeFile(
  path.join(target, "src/app.tsx"),
  `import { PreviewApp } from '../apps/admin/src/preview';
import { demoLayout } from '../fixtures/beijing-demo';
const images = ${JSON.stringify(hosting.images, null, 2)};
export default function App() { return <PreviewApp demoLayout={demoLayout()} images={images} />; }
`,
);
await writeFile(
  path.join(target, "src/index.tsx"),
  `import { createRoot } from 'react-dom/client';
import App from './app';
import '../apps/demo/src/style.css';
createRoot(document.getElementById('root')!).render(<App />);
`,
);
await copyFile("apps/demo/index.html", path.join(target, "index.html"));
const html = await readFile(path.join(target, "index.html"), "utf8");
await writeFile(
  path.join(target, "index.html"),
  html.replace("/src/main.tsx", "/src/index.tsx"),
);
await copyFile(
  "scripts/build-demo-hosted.mjs",
  path.join(target, "scripts/build-demo-hosted.mjs"),
);
const manifestPath = path.join(target, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.scripts.build = "node scripts/build-demo-hosted.mjs";
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Exported existing demo source to ${target}; images use app storage, expire ${hosting.assetExpiresAt}`,
);
