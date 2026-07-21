import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { STORAGE_STATE } from "./env";

/**
 * Static content fixtures. Every row this suite creates is namespaced (`e2e_` for auth rows,
 * `e2e-` for ideas) so teardown deletes exactly what it made and nothing else.
 */
export const E2E = {
  userName: "E2E Purchase User",
  ideaSlug: "e2e-locked-idea",
  ideaTitle: "E2E Locked Idea",
  /** Rendered only by IdeaCard, never by LockedTeaser — the access assertion hinges on this. */
  ideaOneLiner: "This one-liner is visible only to a paying subscriber.",
  ideaNiche: "E2E Fixtures",
} as const;

export type Run = { runId: string; userId: string; userEmail: string; sessionId: string };

const RUN_FILE = resolve(dirname(STORAGE_STATE), "run.json");

/**
 * The user identity is regenerated on EVERY run, and that is load-bearing rather than tidiness.
 *
 * `POST /v2/subscriptions/create` is idempotent on `externalId` at AbacatePay: a repeat call with
 * an externalId that already has a subscription returns the ORIGINAL bill and never validates the
 * product it was handed. Verified directly against their API — sending a product with no billing
 * cycle (which a fresh externalId rejects with 400 "Subscription checkout only accepts products
 * with cycle defined") returns 200 and the previous bill when the externalId is reused.
 *
 * The checkout route passes our user id as `externalId`. So a suite with a FIXED test user stops
 * exercising provider-side validation after its first ever run — checkout keeps returning 200 off
 * AbacatePay's cache no matter how badly ABACATEPAY_PRODUCT_ID is misconfigured. That is a green
 * suite over a checkout flow that is broken in production, which is precisely the failure this
 * suite exists to prevent. A fresh id per run forces a real create, and a real validation, every
 * single time.
 */
export function newRun(): Run {
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return {
    runId,
    userId: `e2e_user_${runId}`,
    userEmail: `e2e_${runId}@example.test`,
    sessionId: `e2e_session_${runId}`,
  };
}

/** global-setup and the test workers are separate processes; the run identity travels on disk. */
export function writeRun(run: Run): void {
  mkdirSync(dirname(RUN_FILE), { recursive: true });
  writeFileSync(RUN_FILE, JSON.stringify(run, null, 2));
}

export function readRun(): Run {
  return JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
}
