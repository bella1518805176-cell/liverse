import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/demo",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      channel: "chrome",
      args: [
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "pnpm demo",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
