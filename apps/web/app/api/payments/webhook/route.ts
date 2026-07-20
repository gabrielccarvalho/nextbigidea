import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";

const PRICE_CENTS = 11000; // R$110 ≈ $20 lifetime access

export async function POST(req: NextRequest) {
  // Raw bytes are required — HMAC is computed over the exact body AbacatePay sent. Parsing
  // JSON first and re-serializing would change the bytes and the signature would never match.
  const rawBody = await req.text();

  // Confirmed against AbacatePay's live docs (see task report): they sign with HMAC-SHA256,
  // base64-encoded, in `X-Webhook-Signature`. That HMAC key is published in their docs and
  // shared by every merchant, so it alone does not authenticate "this callback is for my
  // account" — only that the bytes weren't altered in transit. The real per-account gate is
  // the `webhookSecret` query param AbacatePay echoes back on the URL you registered for this
  // webhook in their dashboard (must be configured to include `?webhookSecret=<value matching
  // ABACATEPAY_WEBHOOK_SECRET>`). AbacatePayProvider.verifyAndParseWebhook checks both and
  // returns null — never touching the database — if either check fails.
  const signature = req.headers.get("x-webhook-signature");
  const urlSecret = req.nextUrl.searchParams.get("webhookSecret");

  const event = getPaymentProvider().verifyAndParseWebhook(rawBody, signature, urlSecret);
  if (!event) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (event.type === "paid") {
    // Idempotent: a retry of an already-processed event finds no row still `pending` (it's
    // already `paid`), so this UPDATE matches zero rows and does nothing.
    const updated = await db
      .update(purchases)
      .set({ status: "paid", paidAt: new Date() })
      .where(
        and(eq(purchases.providerChargeId, event.providerChargeId), eq(purchases.status, "pending")),
      )
      .returning({ id: purchases.id });

    // Fallback: no pending row matched (e.g. the checkout-creation write never landed). Only
    // insert a paid row if none exists yet for this charge — this makes a replayed webhook a
    // no-op instead of creating a duplicate paid purchase.
    if (updated.length === 0 && event.externalId) {
      const existing = await db
        .select({ id: purchases.id })
        .from(purchases)
        .where(eq(purchases.providerChargeId, event.providerChargeId))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(purchases).values({
          userId: event.externalId,
          provider: "abacatepay",
          providerChargeId: event.providerChargeId,
          amountCents: PRICE_CENTS,
          currency: "BRL",
          status: "paid",
          paidAt: new Date(),
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
