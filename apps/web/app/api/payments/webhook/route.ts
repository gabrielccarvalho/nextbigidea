import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getTransactionalDb, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";
import { CURRENCY, PRICE_CENTS } from "@/lib/payments/provider";
import { notifyPaymentFailure } from "@/lib/payments/alert";

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
 * Serializes all writes for one user inside the current transaction.
 *
 * `SELECT ... FOR UPDATE` alone is not enough: it can only lock rows that already exist, so two
 * concurrent deliveries for a user with NO rows yet would both find nothing to lock and both
 * insert. A transaction-scoped advisory lock has no such gap — it is keyed on the user id
 * itself, is released automatically at COMMIT or ROLLBACK, and touches no table (so it cannot
 * deadlock against auth writes). Every branch takes it FIRST, before any row lock, which gives
 * all webhook handlers a single consistent lock ordering.
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
 * LATENCY MATTERS HERE, unusually for a webhook. When a `checkout.session.completed` endpoint is
 * registered, Stripe holds the customer on the hosted page for up to 10 seconds waiting for this
 * handler to respond before redirecting them to `success_url`. A slow handler is a visibly slow
 * checkout, so this route does the minimum work that makes the payment durable and returns.
 *
 * That is also why it acts on the verified webhook payload directly instead of re-retrieving the
 * Checkout Session from the API, which Stripe's fulfillment guide suggests. The re-retrieve
 * exists so you can read expanded `line_items`; this integration sells exactly one thing and
 * needs no line items, so the round-trip would buy nothing and spend part of that 10s budget.
 * The payload is signed, so trusting it costs no security.
 */
export async function POST(req: NextRequest) {
  // Raw bytes are required — the signature is computed over the exact body Stripe sent. Parsing
  // JSON first and re-serializing would change the bytes and verification would never match.
  const rawBody = await req.text();

  // Stripe signs with a secret unique to THIS endpoint, so unlike the AbacatePay integration
  // this replaced there is no second out-of-band gate to check: a valid signature proves both
  // that the bytes are intact and that the callback belongs to our account. Verification also
  // enforces a 5-minute timestamp tolerance, which is the replay defence.
  const signature = req.headers.get("stripe-signature");

  const provider = getPaymentProvider();
  const event = await provider.verifyAndParseWebhook(rawBody, signature);
  if (!event) {
    // A verification failure is NOT recoverable by retrying — reject it permanently.
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Resolved per request rather than at module scope so importing this route (during `next
  // build`, for instance) never builds a connection pool.
  const db = getTransactionalDb();

  const now = new Date();

  if (event.type === "paid") {
    // Record what Stripe actually charged, falling back to the local constants only when the
    // payload omits them. The amount on the row should describe the real charge rather than what
    // this codebase assumed the price was — those two diverging is exactly the failure
    // assertPriceMatches() guards against at checkout time.
    const amountCents = event.amountCents ?? PRICE_CENTS;
    const currency = (event.currency ?? CURRENCY).toUpperCase();

    // Idempotent: a retry of an already-processed event finds no row still `pending` (it's
    // already `paid`), so this UPDATE matches zero rows and does nothing. The `status =
    // 'pending'` predicate is re-asserted on the UPDATE, and both it and the read sit inside one
    // transaction, so a concurrent delivery of the SAME session cannot slip between them.
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
        // tells us WHICH user to lock), so a concurrent delivery of this same event may have
        // already flipped the row to `paid`. The `status = 'pending'` predicate on the UPDATE is
        // the second guard.
        const stillPending = await tx
          .select({ id: purchases.id })
          .from(purchases)
          .where(and(eq(purchases.id, row.id), eq(purchases.status, "pending")))
          .limit(1)
          .for("update");
        if (stillPending.length === 0) {
          await backfillPaymentIntentId(tx, row.id, event.paymentIntentId);
          return;
        }

        await tx
          .update(purchases)
          .set({
            status: "paid",
            paidAt: now,
            amountCents,
            currency,
            // The join key every future refund and dispute depends on. A refund callback
            // describes a Charge, which knows its PaymentIntent but not the Checkout Session,
            // so losing this makes the refund unresolvable.
            ...(event.paymentIntentId ? { providerPaymentIntentId: event.paymentIntentId } : {}),
          })
          .where(and(eq(purchases.id, row.id), eq(purchases.status, "pending")));
      });
    } else {
      // Fallback: no row is still `pending`. Three cases reach here: nothing exists yet
      // (insert), the event was already processed (a `paid` row exists — the only thing left
      // worth doing is depositing the PaymentIntent id), or the row exists but is STILL
      // `pending` because this webhook overtook the checkout route's own INSERT, which lands
      // after its outbound create-session call returns. The third case is handled below by
      // re-checking `status` under the lock.
      const known = await db
        .select({ userId: purchases.userId })
        .from(purchases)
        .where(eq(purchases.providerChargeId, event.providerChargeId))
        .limit(1);

      // Whose money this is. STORED value first, payload second — deliberately.
      //
      // `known[0].userId` is the owner of the row this branch will actually lock and mutate:
      // ground truth. `event.externalId` (Stripe's `client_reference_id`) is a payload claim. If
      // the two ever diverged, preferring the payload would take the advisory lock on ONE user
      // while updating ANOTHER user's row, breaking the "one lock per user serializes every
      // write for that user" invariant the whole concurrency design rests on. On the insert path
      // `known` is empty, so this degrades to the payload — the only source available when no
      // row exists yet.
      const ownerId = known[0]?.userId ?? event.externalId;

      if (!ownerId) {
        // A payment was collected and there is no row and no user to attach one to. That is a
        // state a retry can resolve (the pending row may simply not have been written yet), so
        // make it loud and retryable rather than silent and permanent — a 200 here would tell
        // Stripe the event is final and it would never redeliver.
        console.error(
          `[payments] paid webhook for session ${event.providerChargeId} has no pending row, no ` +
            `existing row and no client_reference_id; NOTHING was recorded for this payment`,
        );
        await notifyPaymentFailure({
          kind: "unresolvable_paid_event",
          detail: `session ${event.providerChargeId}`,
        });
        return NextResponse.json({ error: "unresolvable_paid_event" }, { status: 503 });
      }

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
            // Safe and idempotent regardless of the row's status, so it always runs — this is
            // the one path that can still repair a missing PaymentIntent id, and without it a
            // later refund for this payment would have nothing to match on.
            await backfillPaymentIntentId(tx, existing[0]!.id, event.paymentIntentId);

            // Flipping a still-`pending` row to `paid` is NOT this branch's job — the
            // pending-row branch above owns that. Tell the caller to retry via a 5xx below so
            // the redelivered event takes that branch once the INSERT has landed.
            if (existing[0]!.status === "pending") stillPending = true;
            return;
          }

          // onConflictDoNothing: purchases_provider_charge_uq makes idempotency a database
          // guarantee — a concurrent retry that loses this race is a no-op, not a 500 that
          // makes Stripe retry forever. The explicit target keeps that intent legible if
          // another unique constraint is ever added to this table.
          await tx
            .insert(purchases)
            .values({
              userId: ownerId,
              provider: provider.name,
              providerChargeId: event.providerChargeId,
              providerPaymentIntentId: event.paymentIntentId ?? null,
              amountCents,
              currency,
              status: "paid",
              paidAt: now,
            })
            .onConflictDoNothing({ target: purchases.providerChargeId });
        });
      } catch (err) {
        // `user_id` is a FK to user.id. A stale or deleted user makes this throw, and a 500
        // would make Stripe retry the same doomed event until delivery is exhausted. The event
        // IS verified at this point — it just can't be resolved to a user — so acknowledge it
        // and surface the problem in logs instead of looping.
        //
        // Only the genuinely unresolvable foreign-key violation is swallowed. Everything else
        // (pool exhaustion, statement timeout, deadlock — the transient failures a retry would
        // fix) is rethrown so the request 500s and Stripe redelivers.
        if (postgresErrorCode(err) !== FOREIGN_KEY_VIOLATION) throw err;
        console.error(
          `[payments] verified webhook for session ${event.providerChargeId} could not be ` +
            `resolved to user ${ownerId}:`,
          err,
        );
      }

      if (stillPending) {
        // No write happened above besides the idempotent back-fill, so retrying this exact event
        // is safe: the redelivery re-enters at the top, finds the row still `pending`, and takes
        // the pending-row branch, which flips it to `paid` and grants access.
        console.error(
          `[payments] paid webhook for session ${event.providerChargeId} found its row still ` +
            `\`pending\`; deferring to a retry instead of granting access early`,
        );
        await notifyPaymentFailure({
          kind: "row_still_pending",
          detail: `session ${event.providerChargeId}`,
        });
        return NextResponse.json({ error: "row_still_pending" }, { status: 503 });
      }
    }
  } else if (event.type === "refunded") {
    // Refunds and chargebacks are the ONLY thing that revokes access, and under the one-time
    // purchase model revoking is now just flipping the status: access is "any row with status =
    // 'paid'" (lib/viewer-access.ts), so a refunded row stops granting the moment it changes.
    // The period-stack arithmetic this branch used to perform existed only because access was
    // MAX(period_end) across stacked subscription renewals. There are no periods and no stack.
    //
    // Matched on the PaymentIntent id, not the Checkout Session id: a refund describes a Charge,
    // which knows its PaymentIntent but not the Session that created it.
    const revoked = await db.transaction(async (tx) => {
      // Resolve the owner before taking any lock so the advisory lock is still the first lock
      // acquired, keeping lock ordering identical across every branch.
      const target = await tx
        .select({ userId: purchases.userId })
        .from(purchases)
        .where(eq(purchases.providerPaymentIntentId, event.paymentIntentId))
        .limit(1);
      if (target.length === 0) return false;
      await lockUser(tx, target[0]!.userId);

      // Filtering on `status = 'paid'` makes this idempotent: a redelivered refund finds the row
      // already `refunded` and matches nothing.
      const updated = await tx
        .update(purchases)
        .set({ status: "refunded" })
        .where(
          and(
            eq(purchases.providerPaymentIntentId, event.paymentIntentId),
            eq(purchases.status, "paid"),
          ),
        )
        .returning({ id: purchases.id });

      // A row existed, so this event IS resolvable even when the UPDATE matched nothing (the
      // redelivery case). Reporting success prevents Stripe retrying an already-applied refund.
      void updated;
      return true;
    });

    if (!revoked) {
      console.error(
        `[payments] refund/chargeback for payment intent ${event.paymentIntentId} matched no ` +
          `purchase row; NOTHING was revoked`,
      );
      // Webhook delivery is neither ordered nor guaranteed, so "the paid row hasn't been written
      // yet" is RECOVERABLE — but a 200 tells Stripe the refund is final and it never comes
      // back. The paid event would then land afterwards and grant access that was charged back,
      // with no second refund delivery to undo it. A 5xx gets it redelivered and the retry
      // succeeds once the paid row exists.
      await notifyPaymentFailure({
        kind: "refund_target_not_found",
        detail: `payment intent ${event.paymentIntentId}`,
      });
      return NextResponse.json({ error: "refund_target_not_found" }, { status: 503 });
    }

    console.info(
      `[payments] revoked access for payment intent ${event.paymentIntentId} (refund or dispute)`,
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * Deposits the PaymentIntent id on a row that has none.
 *
 * Guarantees, which callers rely on:
 *  - Callers MUST already hold the user's advisory lock.
 *  - `isNull(providerPaymentIntentId)` is carried on the UPDATE, so "never overwrite a stored
 *    id" is a DATABASE guarantee rather than an application check a concurrent writer could
 *    slip past.
 *  - Only that one nullable column is written. `status`, `paid_at` and the amount columns are
 *    never touched, so this can never grant or revoke access.
 *  - Idempotent: a second run matches nothing.
 */
async function backfillPaymentIntentId(
  tx: Tx,
  purchaseId: number,
  incoming: string | null | undefined,
) {
  if (!incoming) return;
  await tx
    .update(purchases)
    .set({ providerPaymentIntentId: incoming })
    .where(and(eq(purchases.id, purchaseId), isNull(purchases.providerPaymentIntentId)));
}
