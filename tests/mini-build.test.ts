import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
beforeAll(() => {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/build-mini.ts"],
    { encoding: "utf8", cwd: process.cwd() },
  );
  if (r.status) throw new Error(r.stderr + r.stdout);
}, 30000);
describe("native build contract", () => {
  it("has every registered page wired to real output files", () => {
    const config = JSON.parse(
      readFileSync("dist/miniprogram/app.json", "utf8"),
    );
    const pages = [
      ...config.pages,
      ...config.subPackages.flatMap((s: { root: string; pages: string[] }) =>
        s.pages.map((p) => `${s.root}/${p}`),
      ),
    ];
    expect(pages.length).toBe(11);
    for (const page of pages)
      for (const ext of ["js", "json", "wxml"])
        expect(
          existsSync(`dist/miniprogram/${page}.${ext}`),
          `${page}.${ext}`,
        ).toBe(true);
  });
  it("uses shared singleton services across page bundles", () => {
    const home = readFileSync("dist/miniprogram/pages/home/index.js", "utf8"),
      preview = readFileSync(
        "dist/miniprogram/subpackages/venue/preview/index.js",
        "utf8",
      );
    expect(home).toContain('require("../../services/store.js")');
    expect(preview).toContain('require("../../../services/store.js")');
  });
  it("runs precompiled validators without dynamic code generation", () => {
    const code = readFileSync("dist/miniprogram/services/store.js", "utf8");
    expect(code).not.toMatch(/new Function\(/);
    const context = {
      module: { exports: {} },
      wx: { getStorageSync: () => undefined, setStorageSync: () => {} },
    };
    vm.runInNewContext(code, context, {
      timeout: 3000,
      contextCodeGeneration: { strings: false, wasm: false },
    });
    expect(context.module.exports).toHaveProperty("store");
  });
  it("refuses an unconfigured production build", () => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/build-mini.ts", "--production"],
      {
        encoding: "utf8",
        env: { ...process.env, MINI_APP_ID: "", MINI_API_BASE: "" },
      },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("Production requires");
  });
});
