import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Skip D1 sync in E2E tests + pre-set CSRF cookie for mutation requests
    storageState: {
      cookies: [{
        name: "csrf_token",
        value: "e2e-test-csrf-token",
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Strict",
        expires: -1,
      }],
      origins: [{
        origin: "http://localhost:3000",
        localStorage: [{ name: "__skip_d1_sync", value: "1" }],
      }],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
