import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getTransactionalDb, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";
import { PRICE_CENTS } from "@/lib/payments/provider";
import { computeNextPeriod, computeRefundStackShift } from "@/lib/billing-period";
import { needsSubscriptionIdBackfill } from "@/lib/payments/subscription-backfill";

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
  //
  // NOT A BUG: `hashtext` returns int4, so two different user ids can collide onto the same lock
  // key. The only consequence is that those two users' webhooks serialize against each other for
  // the duration of one transaction. Correctness is unaffected — the lock is a mutual-exclusion
  // primitive, never an identity — so a collision costs a little throughput and nothing else.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}::text))`);
}

/**
 * THE single subscription-id back-fill. Both `paid` sub-branches route through here so the
 * guarantees below are stated and enforced in exactly one place.
 *
 * `checkout.completed` and `subscription.completed` are both emitted for a subscription's FIRST
 * charge and both carry the same charge id, but only `subscription.completed` carries the
 * subscription id — the sole join key for every future renewal. Whichever of the two loses the
 * race must still be able to deposit that id, or renewals 503 forever and access silently lapses.
 *
 * Guarantees, all of which callers rely on:
 *  - Callers MUST already hold the user's advisory lock, so this never runs concurrently with
 *    another write to the same user's rows.
 *  - The row is re-read `FOR UPDATE` here rather than trusting a value read before the lock: in
 *    the racing case the pre-lock read is a stale READ COMMITTED pre-image.
 *  - `isNull(providerSubscriptionId)` is carried on the UPDATE, so "never overwrite a stored id"
 *    is a DATABASE guarantee, not an application check that a concurrent writer could slip past.
 *  - Only that one nullable column is written. `status`, `paid_at` and the period columns are
 *    never touched, so this can never grant, extend or revoke access.
 *  - Idempotent: a second run sees a non-null stored id and does nothing.
 *
 * NOT COVERED BY ANY AUTOMATED TEST: the concurrency guarantees above (racing under the advisory
 * lock, the `FOR UPDATE` re-read, the `IS NULL` guard) are exercised by nothing in this repo's test
 * suite. `subscription-backfill.test.ts` only pins the pure predicate `needsSubscriptionIdBackfill`,
 * which has no locking, no transaction and no database — it cannot observe a race at all. What would
 * cover this: an integration test that opens two real Postgres connections and drives two concurrent
 * `paid` deliveries for the same charge id through this function, then asserts exactly one write wins
 * and the id ends up stored.
 */
async function backfillSubscriptionId(
  tx: Tx,
  purchaseId: number,
  incoming: string | null | undefined,
) {
  if (!incoming) return;

  const rows = await tx
    .select({ providerSubscriptionId: purchases.providerSubscriptionId })
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .limit(1)
    .for("update");

  const stored = rows[0]?.providerSubscriptionId;
  if (rows.length === 0 || !needsSubscriptionIdBackfill(stored, incoming)) return;

  await tx
    .update(purchases)
    .set({ providerSubscriptionId: incoming })
    .where(and(eq(purchases.id, purchaseId), isNull(purchases.providerSubscriptionId)));
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
        and(
          eq(purchases.providerChargeId, event.providerChargeId),
          eq(purchases.status, "pending"),
        ),
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
        if (stillPending.length === 0) {
          // FIX (the concurrent-delivery hole, which is the EXPECTED case): this used to be a
          // bare `return`. Both `checkout.completed` and `subscription.completed` are emitted for
          // ONE first charge, so near-simultaneous delivery is normal, not exotic. The loser's
          // UNLOCKED pre-select above still saw the `pending` pre-image and so took this branch;
          // by the time it got the advisory lock the winner had committed `paid`, this re-read
          // found nothing, and returning here dropped the subscription id while answering 200 —
          // byte-identical to the original bug, with no redelivery to ever repair it. The race is
          // symmetric, so whichever event loses must still deposit whatever it carries.
          await backfillSubscriptionId(tx, row.id, event.providerSubscriptionId);
          return;
        }

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
    } else {
      // Fallback: the unlocked pre-select above found nothing still `pending`. Three cases reach
      // here: nothing exists yet (insert), the charge was already processed by a sibling event (a
      // `paid` row exists — the only thing left worth doing is back-filling the subscription id),
      // or the row exists but is STILL `pending` (this webhook overtook the checkout route's own
      // pending INSERT, which lands after its outbound create-checkout call returns). That third
      // case is handled below by re-checking `status` under the lock.
      const known = await db
        .select({ userId: purchases.userId })
        .from(purchases)
        .where(eq(purchases.providerChargeId, event.providerChargeId))
        .limit(1);

      // Whose money this is. STORED value first, payload second — deliberately.
      //
      // `known[0].userId` is the owner of the row this branch will actually lock and mutate:
      // ground truth. `event.externalId` is an unverified claim in the payload. If the two ever
      // diverged, preferring the payload would take the advisory lock on ONE user while updating
      // ANOTHER user's row, breaking the "one lock per user serializes every write for that user"
      // invariant the whole concurrency design rests on. No divergence is reachable today, so this
      // is hardening rather than a live bug. On the insert path `known` is empty, so this degrades
      // to `externalId` — the only source available when no row exists yet.
      const ownerId = known[0]?.userId ?? event.externalId;

      if (!ownerId) {
        // FIX: this used to fall off the end of the branch and return 200 — a payment was
        // collected, NOTHING was recorded, and AbacatePay never redelivered because 200 means
        // final. There is no row and no user to attach one to, but that is a state a retry can
        // resolve (the pending row may simply not have been written yet), so make it loud and
        // retryable instead of silent and permanent.
        console.error(
          `[payments] paid webhook for charge ${event.providerChargeId} has no pending row, no ` +
            `existing row and no externalId; NOTHING was recorded for this payment`,
        );
        return NextResponse.json({ error: "unresolvable_paid_event" }, { status: 503 });
      }

      // Only insert a paid row if none exists yet for this charge — this makes a replayed
      // webhook a no-op instead of creating a duplicate paid purchase.
      let stillPending = false;
      try {
        await db.transaction(async (tx) => {
          await lockUser(tx, ownerId);
          const existing = await tx
            .select({ id: purchases.id, status: purchases.status })
            .from(purchases)
            .where(eq(purchases.providerChargeId, event.providerChargeId))
            .limit(1)
            .for("update");

          if (existing.length > 0) {
            // FIX (the checkout.completed-before-subscription.completed hole): if the row is
            // already `paid`, the pending-row branch above could not match it and the subscription
            // id it carries had nowhere to go. Deposit it through the ONE shared back-fill path,
            // which re-reads under the lock and carries the `IS NULL` guard on the UPDATE. This is
            // safe and idempotent regardless of the row's status, so it always runs.
            await backfillSubscriptionId(tx, existing[0]!.id, event.providerSubscriptionId);

            // FIX (the still-pending hole): this used to assume `paid` and return 200 unconditionally.
            // But this webhook can overtake the checkout route's own pending INSERT (which lands
            // after its outbound create-checkout call returns), so the row found here may still be
            // `pending` rather than already processed. Flipping it to `paid` is NOT this branch's
            // job — the pending-row branch above owns that, and re-implementing it here would mean
            // computing the period twice from two different code paths. Only the back-fill above is
            // performed; the caller is told to retry via a 5xx below so the redelivered event takes
            // the pending-row branch once the INSERT has landed and grants access there.
            if (existing[0]!.status === "pending") stillPending = true;
            return;
          }

          const period = await nextPeriodFor(tx, ownerId);
          // onConflictDoNothing: purchases_provider_charge_uq makes idempotency a database
          // guarantee — a concurrent retry that loses this race is a no-op, not a 500 that
          // makes the provider retry forever. The explicit target keeps that intent legible
          // if another unique constraint is ever added to this table.
          await tx
            .insert(purchases)
            .values({
              userId: ownerId,
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
        // `user_id` is a FK to user.id. A stale or deleted user makes this throw, and a 500
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
            `resolved to user ${ownerId}:`,
          err,
        );
      }

      if (stillPending) {
        // No write happened above besides the idempotent back-fill, so retrying this exact event
        // is safe: the redelivery re-enters at the top, finds the row still `pending`, and takes
        // the pending-row branch, which flips it to `paid` and grants the period.
        console.error(
          `[payments] paid webhook for charge ${event.providerChargeId} found its row still ` +
            `\`pending\`; deferring to a retry instead of granting access early`,
        );
        return NextResponse.json({ error: "row_still_pending" }, { status: 503 });
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
    const revoked = await db.transaction(async (tx) => {
      // Resolve the owner before taking any lock so the advisory lock is still the first lock
      // acquired, keeping lock ordering identical across every branch.
      const target = await tx
        .select({ userId: purchases.userId })
        .from(purchases)
        .where(eq(purchases.providerChargeId, event.providerChargeId))
        .limit(1);
      if (target.length === 0) return false;
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
        return true;
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
      return true;
    });

    if (!revoked) {
      console.error(
        `[payments] refund/chargeback for charge ${event.providerChargeId} matched no purchase ` +
          `row; NOTHING was revoked`,
      );
      // FIX: this used to fall through to a 200, exactly the defect already fixed for renewals.
      // Webhook delivery is neither ordered nor guaranteed, so "the paid row hasn't been written
      // yet" is RECOVERABLE — but 200 tells AbacatePay the refund is final and it never comes
      // back. The paid event then lands afterwards and grants a full year that was charged back,
      // with no second refund delivery to undo it. A 5xx gets the refund redelivered and the
      // retry succeeds once the paid row exists.
      return NextResponse.json({ error: "refund_target_not_found" }, { status: 503 });
    }
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
