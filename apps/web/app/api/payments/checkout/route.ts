import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";
import { PRICE_CENTS } from "@/lib/payments/provider";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Access is lifetime, so a second charge is never legitimate. The UI hides the CTA
  // from paid users, but this endpoint is directly callable and a stray double-click
  // would otherwise create a second payable PIX charge — and a refund request.
  const alreadyPaid = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, session.user.id), eq(purchases.status, "paid")))
    .limit(1);
  if (alreadyPaid.length > 0) {
    return NextResponse.json({ alreadyPaid: true });
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
