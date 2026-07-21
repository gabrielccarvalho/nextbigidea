import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_PORT, loadEnv, STORAGE_STATE, WEB_ROOT } from "./e2e/support/env";

// The suite talks to the local Postgres/Neon-proxy stack and to AbacatePay's dev API, both of
// which are configured in apps/web/.env. Load it here so the config, global setup and the
// spawned dev server all see the same values.
loadEnv();

export default defineConfig({
  testDir: "./e2e",
  // The specs drive one user's rows through free → pending → paid, so they must observe each
  // other's database writes in order. Parallelism here would be a race, not a speed-up.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: E2E_BASE_URL,
    storageState: STORAGE_STATE,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev --port ${E2E_PORT}`,
    cwd: WEB_ROOT,
    url: E2E_BASE_URL,
    // Never adopt a stray server: it might be a `pnpm dev` on different env (the exact class of
    // bug this suite exists to catch — a stale ABACATEPAY_PRODUCT_ID lives in the server's env).
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...(process.env as Record<string, string>),
      // The app derives returnUrl/completionUrl and the Better Auth base URL from these. They
      // point at :3000 for normal development, which would make the forged session cookie fail
      // origin checks against a server listening on :3100.
      BETTER_AUTH_URL: E2E_BASE_URL,
      NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
      // Next 16 permits one `next dev` per build directory and refuses a second regardless of
      // port. Its own directory is what lets this suite run while `pnpm dev` is up on :3000.
      // See the `distDir` note in next.config.ts.
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
