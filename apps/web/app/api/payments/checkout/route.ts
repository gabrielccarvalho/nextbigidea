import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";
import { PRICE_CENTS } from "@/lib/payments/provider";

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

  // A second subscription is illegitimate only while access is STILL ACTIVE. Once the period
  // has lapsed the user must be able to subscribe again — the old lifetime guard rejected
  // every charge forever, which would have made re-subscribing impossible.
  const active = await db
    .select({ periodEnd: purchases.periodEnd })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, session.user.id),
        eq(purchases.status, "paid"),
        gt(purchases.periodEnd, new Date()),
      ),
    )
    .limit(1);
  if (active.length > 0) {
    return NextResponse.json({ alreadyActive: true, periodEnd: active[0]!.periodEnd });
  }

  // Second guard: a `pending` row created recently means a checkout is already in flight —
  // the user was redirected to AbacatePay moments ago and may simply not have finished (or
  // abandoned the tab and came back). `createCheckout` below creates a REAL auto-renewing
  // subscription at AbacatePay, so letting a second one through here would double-bill the
  // customer every year forever, and nothing in this app reconciles duplicate subscriptions.
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
    completionUrl: `${appUrl}/account?purchase=success`,
  });

  await db.insert(purchases).values({
    userId: session.user.id,
    provider: provider.name,
    providerChargeId: checkout.providerChargeId,
    amountCents: PRICE_CENTS,
    currency: "BRL",
    status: "pending",
  });

  return NextResponse.json({ url: checkout.url });
}
