import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
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
  //
  // FIX: `isNull(cancelledAt)` — the exact predicate the sibling checkout guard carries, and its
  // omission here caused two distinct bugs. (1) Double-cancel: two account tabs, or a retry, both
  // re-resolved the same already-dead subscription id; AbacatePay rejects the second call and the
  // throw was completely uncaught, 500-ing with a stack trace on a money path. (2) Cancelling the
  // WRONG subscription: after cancelling A and resubscribing to B, but before B's paid row lands,
  // the furthest paid row is still A — so a direct POST cancelled A a second time while B kept
  // billing annually, and the user believed they had cancelled when they had not. Excluding
  // already-cancelled rows falls cleanly through to the 400 below in both cases.
  const rows = await db
    .select({ providerSubscriptionId: purchases.providerSubscriptionId })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, session.user.id),
        eq(purchases.status, "paid"),
        isNotNull(purchases.periodEnd),
        isNull(purchases.cancelledAt),
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
  try {
    await provider.cancelSubscription(providerSubscriptionId);
  } catch (err) {
    // FIX: a provider error must never escape as an unhandled 500 with a stack trace on a money
    // path. This call is an outbound HTTP request to AbacatePay — it can fail for reasons entirely
    // outside this request (their outage, a network blip, an id they now reject). 502 says
    // truthfully "the upstream refused", the client already renders its generic error state for any
    // non-2xx, and nothing has been written locally: `cancelled_at` is the `subscription.cancelled`
    // webhook's column alone, so a failed attempt leaves NO partial state and is safe to retry.
    console.error(
      `[payments] provider rejected cancellation of subscription ${providerSubscriptionId} ` +
        `(user ${session.user.id}); nothing was cancelled`,
      err,
    );
    return NextResponse.json({ error: "provider_cancel_failed" }, { status: 502 });
  }

  // Deliberately does NOT write cancelled_at here. The `subscription.cancelled` webhook is
  // the single writer of that column, so the database reflects what AbacatePay actually did
  // rather than what this request hoped it did — if the provider call above threw, we would
  // never reach here at all, and if the webhook is delayed the UI simply catches up shortly.
  return NextResponse.json({ cancelled: true });
}
