import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const files = [
  "apps/demo/index.html",
  "apps/demo/src/main.tsx",
  "apps/demo/src/style.css",
  "apps/demo/src/Venue3D.tsx",
  "apps/demo/src/venue-data.ts",
  "apps/demo/src/venue-scene.ts",
  "apps/demo/src/env.d.ts",
  "docs/data/shanghai-3d-placement-estimate.json",
  "scripts/build-demo-hosted.mjs",
];

export async function exportDemoCloud(root: string, target: string, assetsFile: string) {
  const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
  const hosting = await readJson(path.join(root, "infra/demo-hosting.json"));
  const meta = await readJson(path.join(target, ".spark/meta.json"));
  const assets = await readJson(assetsFile);
  if (meta.app_id !== hosting.appId || assets.appId !== hosting.appId) {
    throw new Error("Hosting app ID does not match the target and asset configuration");
  }
  if (!(Date.parse(assets.assetExpiresAt) > Date.now())) {
    throw new Error("Demo assets require fresh signed URLs");
  }
  const imageUrl = (role: "logo" | "hero") => {
    const url = new URL(assets.images?.[role]);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".feishucdn.com") || !url.searchParams.has("sign")) {
      throw new Error(`Expected a signed app storage URL for the ${role}`);
    }
    return url.href;
  };
  const replacements = new Map([
    ["/assets/liverse-logo-reference.png", imageUrl("logo")],
    ["/assets/liverse-live-audience.webp", imageUrl("hero")],
  ]);
  const manifestPath = path.join(target, "package.json");
  const manifest = await readJson(manifestPath);

  const html = await readFile(path.join(root, "apps/demo/index.html"), "utf8");
  await writeFile(path.join(target, "index.html"), html.replace("/src/main.tsx", "/src/index.tsx"));
  for (const file of files.slice(1)) {
    const destination = path.join(target, file);
    await mkdir(path.dirname(destination), { recursive: true });
    if (file.endsWith("/main.tsx") || file.endsWith("/style.css")) {
      let contents = await readFile(path.join(root, file), "utf8");
      for (const [local, remote] of replacements) contents = contents.replaceAll(local, remote);
      await writeFile(destination, contents);
    } else {
      await copyFile(path.join(root, file), destination);
    }
  }
  await mkdir(path.join(target, "src"), { recursive: true });
  await writeFile(path.join(target, "src/index.tsx"), 'import "../apps/demo/src/main";\n');
  manifest.scripts.build = "node scripts/build-demo-hosted.mjs";
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.cwd();
  await exportDemoCloud(
    root,
    path.resolve(process.argv[3] ?? ".local/liverse-demo-cloud"),
    path.resolve(process.argv[2] ?? "infra/demo-hosting.json"),
  );
  console.log("Exported Shanghai Demo to the hosting checkout");
}
