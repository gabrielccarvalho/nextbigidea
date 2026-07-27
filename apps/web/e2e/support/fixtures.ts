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
  /** Rendered only by IdeaCard, never to a viewer without access — the access assertion hinges on this. */
  ideaOneLiner: "This one-liner is visible only to a paying viewer.",
  ideaNiche: "E2E Fixtures",
} as const;

export type Run = { runId: string; userId: string; userEmail: string; sessionId: string };

const RUN_FILE = resolve(dirname(STORAGE_STATE), "run.json");

/**
 * The user identity is regenerated on EVERY run, and that is load-bearing rather than tidiness.
 *
 * The purchase spec drives a user from locked to paid. That paid row grants access forever under
 * the one-time purchase model, so a FIXED test user would arrive at its second run already
 * owning access: the checkout route's first guard would answer `{ alreadyActive: true }` and the
 * test would never reach the Stripe call it exists to exercise. Teardown deletes the rows, but
 * relying on teardown having succeeded is exactly the assumption that goes wrong after an
 * interrupted run. A fresh id per run makes the starting state unconditional.
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
