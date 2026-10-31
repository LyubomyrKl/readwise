import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests of the readers against a running stack (docs/document-architecture.md, Testing):
 * real books, real engines, Chrome and WebKit (the closest to Safari we can run here).
 *   READER_BASE_URL  the stack (default https://localhost:18443, the isolated test stack)
 *   READER_BOOKS     a folder with the books to open (default /tmp/wbtest/books); tests skip
 *                    the books that are not there
 * Run: npm run test:browser --workspace apps/web
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.READER_BASE_URL ?? "https://localhost:18443",
    // the test stack serves HTTPS with Caddy's internal CA (WebKit sends Secure cookies only over HTTPS)
    ignoreHTTPSErrors: true,
    storageState: "e2e/.state/session.json",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 860 },
  },
  projects: [
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 860 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 860 } } },
  ],
});
