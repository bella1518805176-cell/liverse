import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

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
});
