// The authoritative charge amount is whatever price is configured on the AbacatePay product
// referenced by ABACATEPAY_PRODUCT_ID (set once in AbacatePay's dashboard). This constant only
// records what we *expect* that price to be, for locally computing/recording purchase amounts —
// it does not drive the actual charge, and the two must be kept in sync manually.
export const PRICE_CENTS = 11000; // R$110 ≈ $20 lifetime access

export interface CheckoutResult {
  url: string;
  providerChargeId: string;
}

export interface PaymentEvent {
  type: "paid" | "other";
  providerChargeId: string;
  externalId?: string;
}

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
}
