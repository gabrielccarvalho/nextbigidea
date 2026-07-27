// The authoritative charge amount is whatever price is configured on the Stripe Price
// referenced by STRIPE_PRICE_ID (created once in Stripe's dashboard). This constant only
// records what we *expect* that price to be, for locally recording purchase amounts — it does
// not drive the actual charge, and the two must be kept in sync manually.
//
// lib/content.test.ts pins PRICING.amount in lib/content.ts to this value, so the marketing
// copy and the recorded amount cannot drift apart silently. It cannot pin either of them to
// Stripe — that check is the deploy-time assertion in assertPriceMatches (see stripe.ts).
export const PRICE_CENTS = 2000; // US$20, charged once

export const CURRENCY = "usd";

export interface CheckoutResult {
  /** Stripe-hosted checkout page. The browser is redirected here. */
  url: string;
  /**
   * The Checkout Session id (`cs_…`). Recorded as `purchases.provider_charge_id`, whose unique
   * index is what makes webhook redelivery idempotent.
   */
  providerChargeId: string;
}

/**
 * A verified provider callback, narrowed to what the webhook route acts on.
 *
 * One-time purchase model: there are exactly two events that move money, and neither has an
 * ordering dependency on the other. Renewal, cancellation and payment-failure events are
 * deliberately absent — a `mode: "payment"` Checkout Session creates no subscription, so
 * Stripe never emits them. See docs/superpowers/specs/2026-07-27-stripe-migration-design.md.
 *
 * `paymentIntentId` is carried on `paid` because it is the ONLY identifier a later refund or
 * dispute callback shares with the original payment: those events describe a Charge, which
 * knows its PaymentIntent but not the Checkout Session that created it. Storing it when the
 * payment lands is what makes refunds resolvable at all.
 */
export type PaymentEvent =
  | {
      type: "paid";
      providerChargeId: string;
      paymentIntentId?: string;
      externalId?: string;
      amountCents?: number;
      currency?: string;
    }
  | { type: "refunded"; paymentIntentId: string }
  | { type: "other" };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: {
    userId: string;
    returnUrl: string;
    completionUrl: string;
  }): Promise<CheckoutResult>;
  /**
   * Verifies a webhook callback and, if authentic, parses it into a PaymentEvent. Returns
   * `null` on any verification failure — callers must treat `null` as "reject, do not touch
   * the database."
   *
   * Async because Stripe's Node SDK verifies asynchronously when the runtime supplies a
   * WebCrypto-backed provider, which is the case on Vercel's Node runtime.
   */
  verifyAndParseWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent | null>;
}
