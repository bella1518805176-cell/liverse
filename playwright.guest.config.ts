import { defineConfig } from "@playwright/test";
import appConfig from "./playwright.config";

export default defineConfig({
  ...appConfig,
  testDir: "tests/guest",
  use: { ...appConfig.use, baseURL: "http://127.0.0.1:4174" },
  webServer: {
    command: "pnpm build:guest && pnpm serve:guest",
    url: "http://127.0.0.1:4174",
    timeout: 60000,
  },
});
