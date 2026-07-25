// The authoritative charge amount is whatever price is configured on the AbacatePay product
// referenced by ABACATEPAY_PRODUCT_ID (set once in AbacatePay's dashboard). This constant only
// records what we *expect* that price to be, for locally computing/recording purchase amounts —
// it does not drive the actual charge, and the two must be kept in sync manually.
export const PRICE_CENTS = 11000; // R$110/year ≈ $20/year

export interface CheckoutResult {
  url: string;
  providerChargeId: string;
}

/**
 * A verified provider callback, narrowed to what the webhook route acts on.
 *
 * `renewed` is separate from `paid` because renewals cannot be resolved to a user the same
 * way: AbacatePay generates the renewal checkout itself and it carries `externalId: null`.
 * The only join key is `providerSubscriptionId`, captured when the subscription was created.
 *
 * `cancelled` deliberately carries no access implication — see getViewerAccess in
 * lib/viewer-access.ts.
 */
export type PaymentEvent =
  | { type: "paid"; providerChargeId: string; providerSubscriptionId?: string; externalId?: string }
  | { type: "renewed"; providerChargeId: string; providerSubscriptionId: string }
  | { type: "refunded"; providerChargeId: string }
  | { type: "cancelled"; providerSubscriptionId: string; cancelledDueTo?: string }
  | { type: "payment_failed"; providerSubscriptionId: string }
  | { type: "other" };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: {
    userId: string;
    amountCents: number;
    returnUrl: string;
    completionUrl: string;
  }): Promise<CheckoutResult>;
  /**
   * Verifies a webhook callback and, if authentic, parses it into a PaymentEvent. Returns
   * `null` on any verification failure — callers must treat `null` as "reject, do not touch
   * the database."
   *
   * `urlSecret` is an out-of-band secret the provider may deliver alongside the request
   * (for AbacatePay: a `?webhookSecret=` query param on the registered callback URL, which is
   * the *actual* per-account authentication boundary — see abacatepay.ts for why the HMAC
   * signature alone is not enough). Providers that don't use one may ignore this parameter.
   */
  verifyAndParseWebhook(
    rawBody: string,
    signature: string | null,
    urlSecret?: string | null,
  ): PaymentEvent | null;
  /**
   * Cancels a recurring subscription at the provider. Immediate and irreversible for
   * AbacatePay: future charges stop, nothing is refunded, and the customer keeps access
   * through the period they already paid for. Returns true when the provider confirms.
   */
  cancelSubscription(providerSubscriptionId: string): Promise<boolean>;
}
