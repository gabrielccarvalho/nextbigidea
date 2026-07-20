import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Resolved from the SESSION user's own rows only — never from a request parameter — so
  // one user can never cancel another user's subscription. Furthest period_end wins, same
  // as getViewerAccess: that is the row whose providerSubscriptionId is the live one.
  const rows = await db
    .select({ providerSubscriptionId: purchases.providerSubscriptionId })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, session.user.id),
        eq(purchases.status, "paid"),
        isNotNull(purchases.periodEnd),
      ),
    )
    .orderBy(desc(purchases.periodEnd))
    .limit(1);

  const providerSubscriptionId = rows[0]?.providerSubscriptionId;
  if (!providerSubscriptionId) {
    return NextResponse.json(
      { error: "no_active_subscription" },
      { status: 400 },
    );
  }

  const provider = getPaymentProvider();
  await provider.cancelSubscription(providerSubscriptionId);

  // Deliberately does NOT write cancelled_at here. The `subscription.cancelled` webhook is
  // the single writer of that column, so the database reflects what AbacatePay actually did
  // rather than what this request hoped it did — if the provider call above threw, we would
  // never reach here at all, and if the webhook is delayed the UI simply catches up shortly.
  return NextResponse.json({ cancelled: true });
}
