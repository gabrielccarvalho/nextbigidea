import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { computeAccess } from "./access";

// Live session + DB lookup. Requires a `purchases` row with status = "paid" —
// a "pending" row (checkout started but not completed) must NOT grant access.
// Not unit-tested: needs a live session and Postgres, neither of which exists
// in this environment. See access.test.ts for the pure logic this delegates to.
export async function getViewerAccess(): Promise<{ userId: string | null; hasFullAccess: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  if (!userId) return { userId: null, hasFullAccess: false };
  const paid = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.status, "paid")))
    .limit(1);
  return { userId, ...computeAccess(paid.length > 0) };
}
