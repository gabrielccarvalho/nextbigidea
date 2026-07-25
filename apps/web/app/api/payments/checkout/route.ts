import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";
import { PRICE_CENTS } from "@/lib/payments/provider";
import { notifyPaymentFailure } from "@/lib/payments/alert";

// A `pending` row created within this window is treated as an in-flight checkout, not an
// abandoned one. Each `createCheckout` call creates a REAL auto-renewing subscription at
// AbacatePay — two of them bill the customer twice a year forever, and nothing in the app
// reconciles that. This window is what stops a user who clicks Subscribe, gets redirected,
// abandons the tab, comes back and clicks again from minting a second live subscription.
const PENDING_CHECKOUT_WINDOW_MS = 30 * 60 * 1000;

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // One-time purchase model: any paid row means this user already owns full
  // access with no expiry (mirrors getViewerAccess), so a second charge is
  // never legitimate. This must stay aligned with the access check — a looser
  // predicate here would let an already-paid user buy the same thing twice.
  const active = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, session.user.id), eq(purchases.status, "paid")))
    .limit(1);
  if (active.length > 0) {
    return NextResponse.json({ alreadyActive: true });
  }

  // Second guard: a `pending` row created recently means a checkout is already in flight —
  // the user was redirected to AbacatePay moments ago and may simply not have finished (or
  // abandoned the tab and came back). `createCheckout` below creates a REAL auto-renewing
  // subscription at AbacatePay, so letting a second one through here would double-bill the
  // customer every year forever, and nothing in this app reconciles duplicate subscriptions.
  //
  // KNOWN WEAKNESS. This guard is TIME-based, not state-based: a user who starts a checkout
  // and returns more than PENDING_CHECKOUT_WINDOW_MS later, before the `paid` webhook has
  // landed, sails past it and starts a second live checkout. Closing it properly needs a
  // state-based check (e.g. reconciling with the provider, or a unique partial index over a
  // user's in-flight checkouts) rather than a longer window, which would only trade
  // double-billing for blocking legitimate retries.
  const pendingSince = new Date(Date.now() - PENDING_CHECKOUT_WINDOW_MS);
  const pendingCheckout = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, session.user.id),
        eq(purchases.status, "pending"),
        gt(purchases.createdAt, pendingSince),
      ),
    )
    .limit(1);
  if (pendingCheckout.length > 0) {
    return NextResponse.json({ pendingCheckout: true });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const provider = getPaymentProvider();
  const checkout = await provider.createCheckout({
    userId: session.user.id,
    amountCents: PRICE_CENTS,
    returnUrl: `${appUrl}/ideas`,
    completionUrl: `${appUrl}/ideas?purchase=success`,
  });

  try {
    await db.insert(purchases).values({
      userId: session.user.id,
      provider: provider.name,
      providerChargeId: checkout.providerChargeId,
      amountCents: PRICE_CENTS,
      currency: "BRL",
      status: "pending",
    });
  } catch (err) {
    // FIX: the subscription already exists at AbacatePay — `createCheckout` above succeeded and
    // billing is live — so this INSERT is an optimization, not a requirement. If it throws (pool
    // exhaustion, connection blip), the pending row simply never gets written; the webhook's own
    // fallback branch (see the `paid` handler's `known.length === 0` case) already reconstructs a
    // paid row from `event.externalId` when no pending row exists, precisely to cover this case.
    // Returning a 500 here would be WORSE than doing nothing: the customer would see a failure,
    // retry, sail past both double-subscription guards above (neither of which found a row to
    // match), and mint a SECOND live auto-renewing subscription that bills them every year forever.
    // So this is caught, logged, alerted, and the request still succeeds — the customer completes
    // payment normally and the webhook fallback records it.
    console.error(
      `[payments] failed to write pending row for charge ${checkout.providerChargeId} ` +
        `(user ${session.user.id}); the AbacatePay subscription was already created and is live`,
      err,
    );
    await notifyPaymentFailure({
      kind: "pending_row_insert_failed",
      detail: `charge ${checkout.providerChargeId}, user ${session.user.id}`,
    });
  }

  return NextResponse.json({ url: checkout.url });
}
