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
