import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";
import { PRICE_CENTS } from "@/lib/payments/provider";
import { computeNextPeriod } from "@/lib/billing-period";

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
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const now = new Date();

  // Resolves the access window a new paid row should cover, stacking onto any time the user
  // has already paid for. See lib/billing-period.ts.
  async function nextPeriodFor(userId: string) {
    const rows = await db
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
      .limit(1);
    return computeNextPeriod(rows[0]?.periodEnd ?? null, now);
  }

  if (event.type === "paid") {
    // Idempotent: a retry of an already-processed event finds no row still `pending` (it's
    // already `paid`), so this UPDATE matches zero rows and does nothing — which also means
    // the period is never extended twice for the same charge.
    const pending = await db
      .select({ id: purchases.id, userId: purchases.userId })
      .from(purchases)
      .where(
        and(eq(purchases.providerChargeId, event.providerChargeId), eq(purchases.status, "pending")),
      )
      .limit(1);

    if (pending.length > 0) {
      const row = pending[0]!;
      const period = await nextPeriodFor(row.userId);
      await db
        .update(purchases)
        .set({
          status: "paid",
          paidAt: now,
          providerSubscriptionId: event.providerSubscriptionId ?? null,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        })
        .where(and(eq(purchases.id, row.id), eq(purchases.status, "pending")));
    } else if (event.externalId) {
      // Fallback: no pending row matched (e.g. the checkout-creation write never landed).
      // Only insert a paid row if none exists yet for this charge — this makes a replayed
      // webhook a no-op instead of creating a duplicate paid purchase.
      const existing = await db
        .select({ id: purchases.id })
        .from(purchases)
        .where(eq(purchases.providerChargeId, event.providerChargeId))
        .limit(1);
      if (existing.length === 0) {
        try {
          const period = await nextPeriodFor(event.externalId);
          // onConflictDoNothing: purchases_provider_charge_uq makes idempotency a database
          // guarantee — a concurrent retry that loses this race is a no-op, not a 500 that
          // makes the provider retry forever. The explicit target keeps that intent legible
          // if another unique constraint is ever added to this table.
          await db
            .insert(purchases)
            .values({
              userId: event.externalId,
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
        } catch (err) {
          // `externalId` is a FK to user.id. A stale or deleted user makes this throw, and
          // a 500 would make AbacatePay retry the same doomed event indefinitely. The event
          // IS verified at this point — it just can't be resolved to a user — so acknowledge
          // it and surface the problem in logs instead of looping forever.
          // NOTE: a verification failure still returns 400 above; only this
          // post-verification, known-unresolvable insert degrades to a 200.
          console.error(
            `[payments] verified webhook for charge ${event.providerChargeId} could not be ` +
              `resolved to user ${event.externalId}:`,
            err,
          );
        }
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
    } else {
      const userId = owner[0]!.userId;
      const period = await nextPeriodFor(userId);
      // A new row per renewal. The unique index on provider_charge_id makes a redelivered
      // renewal a no-op, so the period can never be extended twice for one charge.
      await db
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
    }
  } else if (event.type === "refunded") {
    // Refunds and chargebacks are the ONLY thing that revokes access. Flipping status off
    // "paid" drops the row out of the access query, and its period with it.
    await db
      .update(purchases)
      .set({ status: "refunded" })
      .where(eq(purchases.providerChargeId, event.providerChargeId));
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
