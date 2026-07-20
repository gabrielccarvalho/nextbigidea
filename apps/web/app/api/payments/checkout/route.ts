import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";

const PRICE_CENTS = 11000; // R$110 ≈ $20 lifetime access

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
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
