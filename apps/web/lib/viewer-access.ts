import { headers } from "next/headers";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { computeAccess } from "./access";

// Live session + DB lookup. Requires a `purchases` row with status = "paid" AND a
// period_end still in the future — a "pending" row (checkout started but not completed)
// and a lapsed period both grant nothing.
// Not unit-tested: needs a live session and Postgres, neither of which exists
// in this environment. See access.test.ts for the pure logic this delegates to.
export async function getViewerAccess(): Promise<{
  userId: string | null;
  hasFullAccess: boolean;
  periodEnd: Date | null;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  if (!userId) return { userId: null, hasFullAccess: false, periodEnd: null };
  // Furthest period_end wins: renewals stack, so the newest row is not necessarily the
  // one that expires last. `isNotNull` enforces the "status = 'paid' implies period set"
  // invariant at read time rather than trusting it.
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
  return { userId, ...computeAccess(rows[0]?.periodEnd ?? null, new Date()) };
}
