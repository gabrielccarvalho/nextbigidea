import { createHmac } from "node:crypto";
import { ABACATEPAY_HMAC_PUBLIC_KEY } from "@/lib/payments/abacatepay";
import { E2E_BASE_URL, required } from "./env";

/**
 * Posts an AbacatePay webhook exactly as AbacatePay would: HMAC-SHA256 of the raw body,
 * base64-encoded, in `X-Webhook-Signature`, with the per-account secret on the query string.
 *
 * The body is serialised ONCE and both signed and sent as that same string — signing a
 * re-serialised copy would produce different bytes and the route would (correctly) 400.
 */
export async function postWebhook(event: unknown): Promise<{ status: number; body: string }> {
  const rawBody = JSON.stringify(event);
  const signature = createHmac("sha256", ABACATEPAY_HMAC_PUBLIC_KEY)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("base64");

  const url = `${E2E_BASE_URL}/api/payments/webhook?webhookSecret=${encodeURIComponent(
    required("ABACATEPAY_WEBHOOK_SECRET"),
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-signature": signature },
    body: rawBody,
  });
  return { status: res.status, body: await res.text() };
}

/**
 * The first-payment event. `externalId` is present here and only here — it is what ties the
 * charge back to our user (see parseAbacateEvent).
 */
export function subscriptionCompleted(opts: {
  chargeId: string;
  subscriptionId: string;
  userId: string;
}) {
  return {
    id: `e2e_evt_${opts.chargeId}`,
    event: "subscription.completed",
    apiVersion: "v2",
    devMode: true,
    data: {
      checkout: { id: opts.chargeId, externalId: opts.userId },
      subscription: { id: opts.subscriptionId },
    },
  };
}

/** Cancellation: stops future charges, must NOT revoke the period already paid for. */
export function subscriptionCancelled(opts: { subscriptionId: string; dueTo?: string }) {
  return {
    id: `e2e_evt_cancel_${opts.subscriptionId}`,
    event: "subscription.cancelled",
    apiVersion: "v2",
    devMode: true,
    data: {
      subscription: { id: opts.subscriptionId, cancelledDueTo: opts.dueTo ?? "customer_request" },
    },
  };
}
