import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const WEB_ROOT = resolve(here, "../..");

/**
 * Minimal .env loader. Deliberately dependency-free: `dotenv` is a devDependency of
 * @workspace/db, not of this app, and pulling it in just to read five keys would add a
 * dependency to the web package for the sake of the test harness.
 *
 * Never overwrites a variable that is already set, so CI (or the caller) can override any
 * of these from the real environment.
 */
export function loadEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(WEB_ROOT, ".env"), "utf8");
  } catch {
    // Absent .env is fine when everything is already exported (CI).
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Reads a required env var, failing loudly rather than letting a test fail obscurely later. */
export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required to run the E2E suite. Populate apps/web/.env (see its comments) ` +
        `or export it before running \`pnpm --filter web test:e2e\`.`,
    );
  }
  return value;
}

/** The port the suite's own dev server listens on — deliberately not 3000, so it can run
 *  alongside a developer's `pnpm dev`. */
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** Where global-setup writes the forged session cookie for Playwright to load. */
export const STORAGE_STATE = resolve(here, "../.auth/state.json");
