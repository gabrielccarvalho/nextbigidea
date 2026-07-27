import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";
import { CURRENCY, PRICE_CENTS } from "@/lib/payments/provider";
import { resumableCheckoutUrl } from "@/lib/payments/stripe";
import { notifyPaymentFailure } from "@/lib/payments/alert";

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

  // Second guard: is a checkout already in flight for this user?
  //
  // This REPLACES the 30-minute time window the AbacatePay integration used, and closes the
  // weakness that was documented here: that guard was TIME-based, so a user who started a
  // checkout and came back later sailed past it and started a second one. It had to be a
  // guess because AbacatePay's create-checkout minted a REAL auto-renewing subscription, and
  // asking it "is this one still live?" was not part of the flow.
  //
  // Stripe makes the state directly observable, so this is now STATE-based. An unfinished
  // Checkout Session is inert — it bills nothing until the customer completes it — so the
  // correct move is to hand the user back the SAME session rather than block them or mint a
  // second one. Resuming is what makes double-charging unreachable here: there is only ever
  // one open session, so there is only ever one thing the customer can pay.
  const pending = await db
    .select({ id: purchases.id, providerChargeId: purchases.providerChargeId })
    .from(purchases)
    .where(and(eq(purchases.userId, session.user.id), eq(purchases.status, "pending")))
    .orderBy(desc(purchases.createdAt))
    .limit(1);

  if (pending.length > 0) {
    const existing = await resumableCheckoutUrl(pending[0]!.providerChargeId);
    // `open` — hand back the very same hosted page.
    if (existing.state === "open") {
      return NextResponse.json({ url: existing.url });
    }
    // `complete` — they already paid and the webhook simply hasn't landed yet. Creating a
    // second session here would invite a second payment for something already bought.
    if (existing.state === "complete") {
      return NextResponse.json({ pendingCheckout: true });
    }
    // `expired` or unreadable — nothing is in flight, so fall through and create a fresh one.
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const provider = getPaymentProvider();
  const checkout = await provider.createCheckout({
    userId: session.user.id,
    returnUrl: `${appUrl}/ideas`,
    completionUrl: `${appUrl}/ideas?purchase=success`,
  });

  try {
    await db.insert(purchases).values({
      userId: session.user.id,
      provider: provider.name,
      providerChargeId: checkout.providerChargeId,
      amountCents: PRICE_CENTS,
      currency: CURRENCY.toUpperCase(),
      status: "pending",
    });
  } catch (err) {
    // The Checkout Session already exists at Stripe, so this INSERT is an optimization rather
    // than a requirement. If it throws (pool exhaustion, connection blip) the pending row never
    // gets written; the webhook's fallback branch reconstructs a paid row from the session's
    // `client_reference_id` when no pending row exists, precisely to cover this case.
    //
    // Returning a 500 here would be WORSE than doing nothing: the customer would see a failure
    // and retry, and with no pending row to find, the resume guard above could not match — so
    // they would be handed a SECOND session and could pay twice. Caught, logged, alerted, and
    // the request still succeeds.
    console.error(
      `[payments] failed to write pending row for checkout session ${checkout.providerChargeId} ` +
        `(user ${session.user.id}); the Stripe session was already created`,
      err,
    );
    await notifyPaymentFailure({
      kind: "pending_row_insert_failed",
      detail: `session ${checkout.providerChargeId}, user ${session.user.id}`,
    });
  }

  return NextResponse.json({ url: checkout.url });
}
