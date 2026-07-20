import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { getTransactionalDb, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";
import { PRICE_CENTS } from "@/lib/payments/provider";
import { computeNextPeriod, computeRefundStackShift } from "@/lib/billing-period";

/** The drizzle transaction handle, derived so it stays correct if the client type changes. */
type TransactionalDb = ReturnType<typeof getTransactionalDb>;
type Tx = Parameters<Parameters<TransactionalDb["transaction"]>[0]>[0];

const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Postgres surfaces its five-character SQLSTATE as `code`, but drivers wrap errors to differing
 * depths — drizzle in particular re-throws with the driver error attached as `cause`. Walk the
 * chain rather than betting on one shape: guessing wrong here would mean either swallowing a
 * retryable failure or 500-ing on an unresolvable one, and both are silent money bugs.
 */
function postgresErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    if (typeof current !== "object") return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Serializes all period arithmetic for one user inside the current transaction.
 *
 * `SELECT ... FOR UPDATE` alone is not enough: it can only lock rows that already exist, so two
 * concurrent charges for a user with NO paid rows yet would both find nothing to lock and both
 * insert. A transaction-scoped advisory lock has no such gap — it is keyed on the user id itself,
 * is released automatically at COMMIT or ROLLBACK, and touches no table (so it cannot deadlock
 * against auth writes). Every branch takes it FIRST, before any row lock, which also gives all
 * webhook handlers a single consistent lock ordering.
 */
async function lockUser(tx: Tx, userId: string) {
  // The `::text` cast keeps Postgres from having to infer the parameter's type for hashtext().
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}::text))`);
}

export async function POST(req: NextRequest) {
  // Raw bytes are required — HMAC is computed over the exact body AbacatePay sent. Parsing
  // JSON first and re-serializing would change the bytes and the signature would never match.
  const rawBody = await req.text();

  // Confirmed against AbacatePay's live docs (see task report): they sign with HMAC-SHA256,
  // base64-encoded, in `X-Webhook-Signature`. That HMAC key is published in their docs and
  // shared by every merchant, so it alone does not authenticate "this callback is for my
  // account" — only that the bytes weren't altered in transit. The real per-account gate is
  // the `webhookSecret` query param AbacatePay echoes back on the URL you registered for this
  // webhook in their dashboard (must be configured to include `?webhookSecret=<value matching
  // ABACATEPAY_WEBHOOK_SECRET>`). AbacatePayProvider.verifyAndParseWebhook checks both and
  // returns null — never touching the database — if either check fails.
  const signature = req.headers.get("x-webhook-signature");
  const urlSecret = req.nextUrl.searchParams.get("webhookSecret");

  const provider = getPaymentProvider();
  const event = provider.verifyAndParseWebhook(rawBody, signature, urlSecret);
  if (!event) {
    // A verification failure is NOT recoverable by retrying — reject it permanently.
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Resolved per request rather than at module scope so importing this route (during `next build`,
  // for instance) never builds a connection pool.
  const db = getTransactionalDb();

  const now = new Date();

  // Resolves the access window a new paid row should cover, stacking onto any time the user has
  // already paid for. See lib/billing-period.ts. Runs inside the caller's transaction and locks
  // the row it reads, so the write that follows is computed from a period no one else can change
  // underneath it.
  async function nextPeriodFor(tx: Tx, userId: string) {
    const rows = await tx
      .select({ periodEnd: purchases.periodEnd })
      .from(purchases)
      .where(
        and(
          eq(purchases.userId, userId),
          eq(purchases.status, "paid"),
          isNotNull(purchases.periodEnd),
        ),
      )
      .orderBy(desc(purchases.periodEnd))
      .limit(1)
      .for("update");
    return computeNextPeriod(rows[0]?.periodEnd ?? null, now);
  }

  if (event.type === "paid") {
    // Idempotent: a retry of an already-processed event finds no row still `pending` (it's
    // already `paid`), so this UPDATE matches zero rows and does nothing — which also means
    // the period is never extended twice for the same charge. The `status = 'pending'` predicate
    // is re-asserted on the UPDATE, and both it and the read now sit inside one transaction, so
    // a concurrent delivery of the SAME charge cannot slip between them.
    const pending = await db
      .select({ id: purchases.id, userId: purchases.userId })
      .from(purchases)
      .where(
        and(eq(purchases.providerChargeId, event.providerChargeId), eq(purchases.status, "pending")),
      )
      .limit(1);

    if (pending.length > 0) {
      const row = pending[0]!;
      await db.transaction(async (tx) => {
        await lockUser(tx, row.userId);

        // Re-read under the lock. The select above ran unlocked (it had to — its result is what
        // tells us WHICH user to lock), so a concurrent delivery of this same charge may have
        // already flipped the row to `paid`. Bailing here keeps the period from being computed
        // twice; the `status = 'pending'` predicate on the UPDATE below is the second guard.
        const stillPending = await tx
          .select({ id: purchases.id })
          .from(purchases)
          .where(and(eq(purchases.id, row.id), eq(purchases.status, "pending")))
          .limit(1)
          .for("update");
        if (stillPending.length === 0) return;

        const period = await nextPeriodFor(tx, row.userId);
        await tx
          .update(purchases)
          .set({
            status: "paid",
            paidAt: now,
            // FIX: never write the subscription id unconditionally. A `checkout.completed` event
            // carries none; writing `?? null` would erase an id already stored by an earlier
            // `subscription.completed`, and since that handler only matches `pending` rows it
            // would never get a second chance to write it back. The id would be lost for good and
            // EVERY future renewal — which can only be resolved via that id — would fail.
            ...(event.providerSubscriptionId
              ? { providerSubscriptionId: event.providerSubscriptionId }
              : {}),
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
          })
          .where(and(eq(purchases.id, row.id), eq(purchases.status, "pending")));
      });
    } else if (event.externalId) {
      const externalId = event.externalId;
      // Fallback: no pending row matched (e.g. the checkout-creation write never landed).
      // Only insert a paid row if none exists yet for this charge — this makes a replayed
      // webhook a no-op instead of creating a duplicate paid purchase.
      try {
        await db.transaction(async (tx) => {
          await lockUser(tx, externalId);
          const existing = await tx
            .select({ id: purchases.id })
            .from(purchases)
            .where(eq(purchases.providerChargeId, event.providerChargeId))
            .limit(1)
            .for("update");
          if (existing.length > 0) return;

          const period = await nextPeriodFor(tx, externalId);
          // onConflictDoNothing: purchases_provider_charge_uq makes idempotency a database
          // guarantee — a concurrent retry that loses this race is a no-op, not a 500 that
          // makes the provider retry forever. The explicit target keeps that intent legible
          // if another unique constraint is ever added to this table.
          await tx
            .insert(purchases)
            .values({
              userId: externalId,
              provider: provider.name,
              providerChargeId: event.providerChargeId,
              providerSubscriptionId: event.providerSubscriptionId ?? null,
              amountCents: PRICE_CENTS,
              currency: "BRL",
              status: "paid",
              paidAt: now,
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
            })
            .onConflictDoNothing({ target: purchases.providerChargeId });
        });
      } catch (err) {
        // `externalId` is a FK to user.id. A stale or deleted user makes this throw, and a 500
        // would make AbacatePay retry the same doomed event indefinitely. The event IS verified
        // at this point — it just can't be resolved to a user — so acknowledge it and surface the
        // problem in logs instead of looping forever.
        //
        // FIX: discriminate on the SQLSTATE. This used to catch EVERYTHING, which meant pool
        // exhaustion, a statement timeout or a deadlock — the transient failures a provider retry
        // would fix — silently returned 200 for an already-charged payment. AbacatePay treats 200
        // as final and never redelivers, so the money was gone with only a log line as evidence.
        // Only the genuinely unresolvable foreign-key violation is swallowed; everything else is
        // rethrown so the request 500s and gets redelivered.
        //
        // NOTE: a verification failure still returns 400 above; only this post-verification,
        // known-unresolvable insert degrades to a 200.
        if (postgresErrorCode(err) !== FOREIGN_KEY_VIOLATION) throw err;
        console.error(
          `[payments] verified webhook for charge ${event.providerChargeId} could not be ` +
            `resolved to user ${externalId}:`,
          err,
        );
      }
    }
  } else if (event.type === "renewed") {
    // Renewal payloads carry `externalId: null` — the ONLY way back to a user is the
    // subscription id we stored when the subscription was created.
    const owner = await db
      .select({ userId: purchases.userId })
      .from(purchases)
      .where(eq(purchases.providerSubscriptionId, event.providerSubscriptionId))
      .limit(1);
    if (owner.length === 0) {
      console.error(
        `[payments] renewal for subscription ${event.providerSubscriptionId} matched no ` +
          `purchase row; access was NOT extended for charge ${event.providerChargeId}`,
      );
      // FIX: this used to fall through to a 200. Webhook delivery is neither ordered nor
      // guaranteed, so "the owning row hasn't been written yet" is a RECOVERABLE state — a 200
      // told AbacatePay the renewal was handled and it never came back, permanently losing a
      // charge the customer already paid. A 5xx gets it redelivered, and the retry succeeds once
      // the `subscription.completed` that creates the owning row has landed.
      return NextResponse.json({ error: "owner_not_found" }, { status: 503 });
    }
    const userId = owner[0]!.userId;
    await db.transaction(async (tx) => {
      await lockUser(tx, userId);
      const period = await nextPeriodFor(tx, userId);
      // A new row per renewal. The unique index on provider_charge_id makes a redelivered
      // renewal a no-op, so the period can never be extended twice for one charge.
      await tx
        .insert(purchases)
        .values({
          userId,
          provider: provider.name,
          providerChargeId: event.providerChargeId,
          providerSubscriptionId: event.providerSubscriptionId,
          amountCents: PRICE_CENTS,
          currency: "BRL",
          status: "paid",
          paidAt: now,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        })
        .onConflictDoNothing({ target: purchases.providerChargeId });
    });
  } else if (event.type === "refunded") {
    // Refunds and chargebacks are the ONLY thing that revokes access.
    //
    // Flipping status off "paid" is necessary but NOT sufficient: access is MAX(period_end), so
    // refunding an earlier charge in a stack revoked nothing at all — the row stacked on top of
    // it still ended at the same far-future date. The refunded year has to stop counting AND
    // everything resting on it has to slide back by that year. See computeRefundStackShift.
    await db.transaction(async (tx) => {
      // Resolve the owner before taking any lock so the advisory lock is still the first lock
      // acquired, keeping lock ordering identical across every branch.
      const target = await tx
        .select({ userId: purchases.userId })
        .from(purchases)
        .where(eq(purchases.providerChargeId, event.providerChargeId))
        .limit(1);
      if (target.length === 0) return; // unknown charge — nothing to revoke (same as before)
      await lockUser(tx, target[0]!.userId);

      // Re-read under a row lock. Filtering on `status = 'paid'` is what makes this idempotent:
      // a redelivered refund finds the row already `refunded`, matches nothing, and skips the
      // shift — without this a second delivery would slide the stack back a SECOND year and
      // revoke time the customer actually paid for.
      const refundedRows = await tx
        .select({
          id: purchases.id,
          userId: purchases.userId,
          periodStart: purchases.periodStart,
          periodEnd: purchases.periodEnd,
        })
        .from(purchases)
        .where(
          and(eq(purchases.providerChargeId, event.providerChargeId), eq(purchases.status, "paid")),
        )
        .limit(1)
        .for("update");

      const refunded = refundedRows[0];
      if (!refunded || !refunded.periodStart || !refunded.periodEnd) {
        // Either already refunded, or a row that never reached `paid` (an abandoned `pending`
        // checkout, which by design carries no period). Flip the status and stop — there is no
        // period to reclaim and nothing can be stacked on a row that never granted access.
        await tx
          .update(purchases)
          .set({ status: "refunded" })
          .where(eq(purchases.providerChargeId, event.providerChargeId));
        return;
      }

      const others = await tx
        .select({
          id: purchases.id,
          periodStart: purchases.periodStart,
          periodEnd: purchases.periodEnd,
        })
        .from(purchases)
        .where(
          and(
            eq(purchases.userId, refunded.userId),
            eq(purchases.status, "paid"),
            ne(purchases.id, refunded.id),
            isNotNull(purchases.periodStart),
            isNotNull(purchases.periodEnd),
          ),
        )
        .for("update");

      const shifted = computeRefundStackShift(
        { periodStart: refunded.periodStart, periodEnd: refunded.periodEnd },
        others.map((row) => ({
          id: row.id,
          periodStart: row.periodStart!,
          periodEnd: row.periodEnd!,
        })),
      );

      await tx
        .update(purchases)
        .set({ status: "refunded" })
        .where(and(eq(purchases.id, refunded.id), eq(purchases.status, "paid")));

      for (const row of shifted) {
        await tx
          .update(purchases)
          .set({ periodStart: row.periodStart, periodEnd: row.periodEnd })
          .where(eq(purchases.id, row.id));
      }
    });
  } else if (event.type === "cancelled") {
    // Deliberately no access change: the customer paid through period_end and keeps it.
    // AbacatePay cancellation is immediate and stops future charges, so access lapses on
    // its own when the period runs out.
    console.info(
      `[payments] subscription ${event.providerSubscriptionId} cancelled` +
        (event.cancelledDueTo ? ` (${event.cancelledDueTo})` : "") +
        "; access retained until period_end",
    );
  } else if (event.type === "payment_failed") {
    // No access change while AbacatePay retries. If every retry fails it auto-cancels, and
    // the branch above handles that.
    console.warn(
      `[payments] recurring charge failed for subscription ${event.providerSubscriptionId}`,
    );
  }

  return NextResponse.json({ ok: true });
}
