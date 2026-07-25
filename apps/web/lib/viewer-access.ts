import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";

// Live session + DB lookup. One-time purchase model: a single `purchases` row with
// status = "paid" grants full access and it never lapses — access is bought once,
// not rented per period. `period_end` and `cancelled_at` are deliberately ignored
// here; they are provider-side bookkeeping, not access inputs. A "pending" row
// (checkout started but not completed) grants nothing.
// Not unit-tested: needs a live session and Postgres, neither of which exists
// in this environment, and the remaining logic is a bare existence check.
export async function getViewerAccess(): Promise<{
  userId: string | null;
  hasFullAccess: boolean;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  if (!userId) return { userId: null, hasFullAccess: false };
  const rows = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.status, "paid")))
    .limit(1);
  return { userId, hasFullAccess: rows.length > 0 };
}
