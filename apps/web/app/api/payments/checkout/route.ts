import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";
import { PRICE_CENTS } from "@/lib/payments/provider";

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
