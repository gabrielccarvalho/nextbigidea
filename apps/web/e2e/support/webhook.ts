import Stripe from "stripe";
import { E2E_BASE_URL, required } from "./env";

/**
 * Posts a webhook exactly as Stripe would: the raw body signed with the endpoint secret,
 * presented in the `Stripe-Signature` header.
 *
 * The signature is produced by the SDK's own `generateTestHeaderStringAsync`, NOT by a
 * hand-rolled HMAC. That matters: Stripe's scheme is `t=<timestamp>,v1=<hmac of "t.payload">`,
 * and a hand-rolled copy would be a second implementation of the very thing under test — it
 * could drift from the SDK's and the suite would still pass. Using the SDK means a signature
 * this helper produces is valid for exactly the same reason a real one is.
 *
 * The body is serialised ONCE and both signed and sent as that same string — signing a
 * re-serialised copy would produce different bytes and the route would (correctly) 400.
 */
export async function postWebhook(event: unknown): Promise<{ status: number; body: string }> {
  const rawBody = JSON.stringify(event);

  // Signing is pure crypto over the endpoint secret; this client never makes an API call.
  const signature = await new Stripe(
    required("STRIPE_SECRET_KEY"),
  ).webhooks.generateTestHeaderStringAsync({
    payload: rawBody,
    secret: required("STRIPE_WEBHOOK_SECRET"),
  });

  const res = await fetch(`${E2E_BASE_URL}/api/payments/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: rawBody,
  });
  return { status: res.status, body: await res.text() };
}

/**
 * The payment-succeeded event. `client_reference_id` is our user id — it is what ties the
 * session back to a user when no pending row exists (see the webhook route's fallback branch),
 * and `payment_intent` is the id every later refund or dispute will join on.
 */
export function checkoutSessionCompleted(opts: {
  sessionId: string;
  paymentIntentId: string;
  userId: string;
  amountCents: number;
}) {
  return {
    id: `evt_e2e_${opts.sessionId}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: opts.sessionId,
        object: "checkout.session",
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        payment_intent: opts.paymentIntentId,
        client_reference_id: opts.userId,
        metadata: { userId: opts.userId },
        amount_total: opts.amountCents,
        currency: "usd",
      },
    },
  };
}

/**
 * A full refund. `refunded: true` is Stripe's "fully refunded" flag and is what the adapter
 * gates on — a partial refund leaves it false and must NOT revoke access.
 */
export function chargeRefunded(opts: { paymentIntentId: string; amountCents: number }) {
  return {
    id: `evt_e2e_refund_${opts.paymentIntentId}`,
    object: "event",
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_e2e_${opts.paymentIntentId}`,
        object: "charge",
        payment_intent: opts.paymentIntentId,
        refunded: true,
        amount: opts.amountCents,
        amount_refunded: opts.amountCents,
      },
    },
  };
}

/** A PARTIAL refund: same event type, but `refunded` stays false, so access must survive. */
export function chargePartiallyRefunded(opts: { paymentIntentId: string; amountCents: number }) {
  return {
    id: `evt_e2e_partial_${opts.paymentIntentId}`,
    object: "event",
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_e2e_${opts.paymentIntentId}`,
        object: "charge",
        payment_intent: opts.paymentIntentId,
        refunded: false,
        amount: opts.amountCents,
        amount_refunded: Math.floor(opts.amountCents / 2),
      },
    },
  };
}
