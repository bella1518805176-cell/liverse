import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { exportDemoCloud } from "../scripts/export-demo-cloud";

describe("demo hosting configuration", () => {
  it("keeps deployed assets scoped to the demo and records expiry", async () => {
    const config = JSON.parse(
      await readFile("infra/demo-hosting.json", "utf8"),
    );
    expect(config.appId).toMatch(/^app_/);
    expect(config.branch).toBe("sprint/default");
    expect(Date.parse(config.assetExpiresAt)).toBeGreaterThan(
      Date.parse("2026-10-27"),
    );
    for (const value of Object.values(config.images)) {
      const url = new URL(value as string);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("dataloom-dalvfwwy.feishucdn.com");
      expect(url.pathname).toContain("/bucket_aadk4acccp2ao/");
    }
  });

  it("exports the Shanghai UI, model data and signed brand assets to the matched app only", async () => {
    const root = process.cwd();
    const config = JSON.parse(await readFile("infra/demo-hosting.json", "utf8"));
    const target = await mkdtemp(path.join(tmpdir(), "liverse-export-"));
    const assetsFile = path.join(target, "assets.json");
    const images = {
      logo: "https://demo.feishucdn.com/logo.png?sign=sample",
      hero: "https://demo.feishucdn.com/hero.webp?sign=sample",
    };
    const assets = { appId: config.appId, assetExpiresAt: "2100-01-01T00:00:00Z", images };
    const read = (file: string) => readFile(path.join(target, file), "utf8");
    try {
      await mkdir(path.join(target, ".spark"));
      await writeFile(path.join(target, ".spark/meta.json"), JSON.stringify({ app_id: config.appId }));
      await writeFile(path.join(target, "package.json"), JSON.stringify({ scripts: {} }));
      await writeFile(assetsFile, JSON.stringify({ ...assets, appId: "app_other" }));
      await expect(exportDemoCloud(root, target, assetsFile)).rejects.toThrow("app ID");
      await expect(read("index.html")).rejects.toMatchObject({ code: "ENOENT" });

      await writeFile(assetsFile, JSON.stringify(assets));
      await exportDemoCloud(root, target, assetsFile);
      expect(await read("index.html")).toContain('src="/src/index.tsx"');
      expect(await read("src/index.tsx")).toContain("../apps/demo/src/main");
      expect(await read("apps/demo/src/main.tsx")).toContain(images.logo);
      expect(await read("apps/demo/src/style.css")).toContain(images.hero);
      expect(JSON.parse(await read("docs/data/shanghai-3d-placement-estimate.json")).seats).toHaveLength(1208);
      await expect(read("apps/admin/src/preview.tsx")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});
