import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Wave 4 critical gates run against the dev server. Browser resolution:
//
//   - Normal environments: `npx playwright install chromium` populates the
//     standard cache and every project below runs.
//   - Sandboxes where cdn.playwright.dev is unreachable: run
//     `node scripts/ensure-e2e-browser.mjs` first — it extracts a Chromium
//     from the @sparticuz/chromium npm tarball to /tmp/chromium and this
//     config wires launchOptions + LD_LIBRARY_PATH automatically (projects
//     narrow to Chromium, the only engine the tarball provides).
//   - PW_EXECUTABLE_PATH overrides both.

const sandboxExecutable =
  process.env.PW_EXECUTABLE_PATH ??
  (fs.existsSync("/tmp/chromium") && fs.existsSync("/tmp/al2023-libs/lib") ? "/tmp/chromium" : undefined);

export default defineConfig({
  testDir: "./e2e",
  // The Wave 4 gates mutate the dev server's shared in-memory ledger (refund
  // requests, retries). Sequential execution keeps row selection deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // `next dev` compiles each route on first hit (tens of seconds) — budgets
  // must absorb that, not just assertion time.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "html" : "line",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    navigationTimeout: 90_000,
    ...(sandboxExecutable
      ? {
          launchOptions: {
            executablePath: sandboxExecutable,
            headless: true,
            args: ["--no-sandbox", "--disable-dev-shm-usage"],
            env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023-libs/lib" },
          },
        }
      : {}),
  },
  projects: sandboxExecutable
    ? [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
    : [
        {
          name: "chromium",
          use: { ...devices["Desktop Chrome"] },
        },
        {
          name: "firefox",
          use: { ...devices["Desktop Firefox"] },
        },
        {
          name: "webkit",
          use: { ...devices["Desktop Safari"] },
        },
        {
          name: "Mobile Chrome",
          use: { ...devices["Pixel 7"] },
        },
        {
          name: "Mobile Safari",
          use: { ...devices["iPhone 15"] },
        },
      ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // The persona harness is only honoured when AUTH_ENFORCED is off/preview;
    // production stays strict and never reads the cookie (see e2e/test-utils.ts).
    env: { ...process.env, AUTH_ENFORCED: "off" },
  },
});
