import { makeSignature } from "better-auth/crypto";
import { sql } from "./sql";
import { E2E, newRun, writeRun, type Run } from "./fixtures";
import { required } from "./env";

/**
 * Deletes every row this suite creates. Run BOTH before seeding and in teardown: a run that
 * crashed before teardown must not poison the next one, and a developer's real data must never
 * be touched — every predicate is scoped to the `e2e_` / `e2e-` namespace.
 *
 * Order matters: purchases and sessions carry FKs to `user`.
 */
export async function cleanup(): Promise<void> {
  await sql(`delete from purchases where user_id like 'e2e\\_%'`);
  await sql(`delete from session where user_id like 'e2e\\_%'`);
  await sql(`delete from "user" where id like 'e2e\\_%'`);
  await sql(`delete from idea_evidence where idea_id in (select id from ideas where slug like 'e2e-%')`);
  await sql(`delete from ideas where slug like 'e2e-%'`);
}

/**
 * Seeds the authenticated user and forges the Better Auth session cookie for it.
 *
 * Real Google OAuth cannot be driven from Playwright (Google actively blocks automated
 * browsers, and the account would need interactive consent), so the session is minted the same
 * way Better Auth itself would: a `session` row plus a cookie whose value is
 * `<token>.<HMAC-SHA256(token, BETTER_AUTH_SECRET) as base64>`. This exercises every downstream
 * auth check for real — `auth.api.getSession` verifies the signature and loads the row — and
 * only the OAuth handshake itself is stubbed. See the note in purchase.spec.ts.
 *
 * The identity is fresh per run — see `newRun()` for why that is required rather than merely
 * hygienic — and is published to disk so the test workers (separate processes) can read it.
 *
 * @returns the cookie value, already URL-encoded exactly as Better Auth's own `serialize` would.
 */
export async function seedUserAndSession(): Promise<{
  cookieName: string;
  cookieValue: string;
  run: Run;
}> {
  const run = newRun();
  const token = `e2e_token_${run.runId}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await sql(
    `insert into "user" (id, name, email, email_verified, created_at, updated_at)
     values ($1, $2, $3, true, now(), now())`,
    [run.userId, E2E.userName, run.userEmail],
  );
  await sql(
    `insert into session (id, expires_at, token, created_at, updated_at, user_id)
     values ($1, $2, $3, now(), now(), $4)`,
    [run.sessionId, expiresAt.toISOString(), token, run.userId],
  );
  writeRun(run);

  const signature = await makeSignature(token, required("BETTER_AUTH_SECRET"));
  return {
    // No `__Secure-` prefix: the suite runs over plain http on localhost.
    cookieName: "better-auth.session_token",
    cookieValue: encodeURIComponent(`${token}.${signature}`),
    run,
  };
}

/**
 * A published, NON-free idea — the thing the paywall is actually gating. Its one-liner is
 * rendered by IdeaCard and withheld by LockedTeaser, which is what makes it a usable probe for
 * "does this viewer have access".
 */
export async function seedLockedIdea(): Promise<void> {
  await sql(
    `insert into ideas (slug, title, one_liner, description, niche, keywords,
                        demand_score, mrr_low, mrr_high, competition_notes,
                        validation_signals, ask_count, status, is_free, published_at)
     values ($1, $2, $3, $4, $5, $6, 82, 1200, 4800, $7, $8::jsonb, 14, 'published', false, now())`,
    [
      E2E.ideaSlug,
      E2E.ideaTitle,
      E2E.ideaOneLiner,
      "Seeded by the E2E suite to exercise the paywall.",
      E2E.ideaNiche,
      "e2e fixture paywall",
      "No meaningful competition — this row is a test fixture.",
      JSON.stringify(["e2e signal"]),
    ],
  );
}
