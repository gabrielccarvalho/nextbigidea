import { afterEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { parseStripeEvent, StripeProvider } from "./stripe";

/**
 * Covers the event→PaymentEvent mapping, which is where a mistake silently grants or revokes
 * access for real money. Signature verification is not exercised here: it is the SDK's, is
 * covered end-to-end in e2e/purchase.spec.ts (which posts both a validly signed webhook and an
 * unsigned one), and cannot be meaningfully unit tested without reimplementing it.
 *
 * These build the payload shapes by hand and cast, rather than using real Stripe objects, because
 * a full Stripe.Event literal is ~80 irrelevant fields. The cast is confined to this helper so
 * the tests below stay readable and the type hole stays in one place.
 */
function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return { type, data: { object } } as unknown as Stripe.Event;
}

const SESSION = {
  id: "cs_test_123",
  payment_intent: "pi_test_456",
  client_reference_id: "user_abc",
  payment_status: "paid",
  amount_total: 2000,
  currency: "usd",
};

describe("checkout.session.completed", () => {
  it("maps a paid session to a paid event carrying every join key", () => {
    expect(parseStripeEvent(event("checkout.session.completed", SESSION))).toEqual({
      type: "paid",
      providerChargeId: "cs_test_123",
      paymentIntentId: "pi_test_456",
      externalId: "user_abc",
      amountCents: 2000,
      currency: "usd",
    });
  });

  it("does NOT grant access while the payment is still unpaid", () => {
    // Delayed payment methods complete the Session before the funds clear. Granting here would
    // hand over the product before the money exists.
    const pending = parseStripeEvent(
      event("checkout.session.completed", { ...SESSION, payment_status: "unpaid" }),
    );
    expect(pending).toEqual({ type: "other" });
  });

  it("grants access when no payment was required", () => {
    // A 100%-off coupon produces `no_payment_required`. Testing for equality with "paid" — the
    // obvious way to write this check — would refuse a customer who legitimately completed
    // checkout, so this pins the `!== "unpaid"` form the adapter uses.
    const comped = parseStripeEvent(
      event("checkout.session.completed", {
        ...SESSION,
        payment_status: "no_payment_required",
        amount_total: 0,
      }),
    );
    expect(comped).toMatchObject({ type: "paid", providerChargeId: "cs_test_123" });
  });

  it("grants access on the delayed-settlement event too", () => {
    expect(
      parseStripeEvent(event("checkout.session.async_payment_succeeded", SESSION)),
    ).toMatchObject({ type: "paid", providerChargeId: "cs_test_123" });
  });

  it("falls back to metadata when client_reference_id is absent", () => {
    const withMetadata = parseStripeEvent(
      event("checkout.session.completed", {
        ...SESSION,
        client_reference_id: null,
        metadata: { userId: "user_from_metadata" },
      }),
    );
    expect(withMetadata).toMatchObject({ externalId: "user_from_metadata" });
  });

  it("unwraps an expanded PaymentIntent object to its id", () => {
    // `payment_intent` is `string | PaymentIntent | null`. Storing "[object Object]" here would
    // make every future refund for this payment unresolvable.
    const expanded = parseStripeEvent(
      event("checkout.session.completed", {
        ...SESSION,
        payment_intent: { id: "pi_expanded_789", object: "payment_intent" },
      }),
    );
    expect(expanded).toMatchObject({ paymentIntentId: "pi_expanded_789" });
  });

  it("still reports paid when the PaymentIntent id is missing", () => {
    // The payment is real regardless; the webhook route resolves the row by session id and only
    // the refund join key is lost. Dropping the event instead would lose the payment entirely.
    const noPi = parseStripeEvent(
      event("checkout.session.completed", { ...SESSION, payment_intent: null }),
    );
    expect(noPi).toMatchObject({ type: "paid", paymentIntentId: undefined });
  });
});

describe("refunds", () => {
  it("revokes on a FULL refund", () => {
    expect(
      parseStripeEvent(
        event("charge.refunded", {
          payment_intent: "pi_test_456",
          refunded: true,
          amount: 2000,
          amount_refunded: 2000,
        }),
      ),
    ).toEqual({ type: "refunded", paymentIntentId: "pi_test_456" });
  });

  it("does NOT revoke on a partial refund", () => {
    // THE case this whole branch turns on. `charge.refunded` fires for partial refunds too, and
    // `refunded` stays false for them. Gating on the event name alone would cut off a customer
    // who received a goodwill partial refund but still owns what they bought.
    expect(
      parseStripeEvent(
        event("charge.refunded", {
          payment_intent: "pi_test_456",
          refunded: false,
          amount: 2000,
          amount_refunded: 500,
        }),
      ),
    ).toEqual({ type: "other" });
  });

  it("revokes on a dispute", () => {
    expect(
      parseStripeEvent(
        event("charge.dispute.created", {
          id: "dp_1",
          payment_intent: "pi_test_456",
          reason: "fraudulent",
        }),
      ),
    ).toEqual({ type: "refunded", paymentIntentId: "pi_test_456" });
  });

  it("ignores a refund with no PaymentIntent to match on", () => {
    // Nothing can be resolved without the join key, and inventing one would revoke the wrong
    // row. `other` returns 200 and writes nothing.
    expect(
      parseStripeEvent(event("charge.refunded", { payment_intent: null, refunded: true })),
    ).toEqual({ type: "other" });
  });
});

describe("misconfiguration is never mistaken for a forged webhook", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // REGRESSION. `null` from verifyAndParseWebhook makes the route answer 400, which Stripe
  // treats as final and never redelivers. An unset environment variable used to be caught by
  // the same try/catch as a bad signature and returned as null — so a deploy missing
  // STRIPE_WEBHOOK_SECRET would have permanently dropped EVERY real payment webhook while
  // logging "failed signature verification". Money collected, nothing recorded, no retry.
  //
  // Config errors must throw instead, so the route 500s and Stripe keeps redelivering until
  // someone fixes the env. These assert "throws", NOT "returns null" — that distinction is the
  // entire point of the test.
  it("throws (not returns null) when the webhook secret is unset", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    await expect(
      new StripeProvider().verifyAndParseWebhook("{}", "t=1,v1=whatever"),
    ).rejects.toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("still rejects a signature-less callback as a permanent 400", async () => {
    // The other side of the coin: with config present, a missing signature IS a forged
    // callback and must stay a permanent reject.
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_placeholder");

    await expect(new StripeProvider().verifyAndParseWebhook("{}", null)).resolves.toBeNull();
  });

  it("rejects a genuinely bad signature as a permanent 400", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_placeholder");

    await expect(
      new StripeProvider().verifyAndParseWebhook("{}", "t=1,v1=deadbeef"),
    ).resolves.toBeNull();
  });
});

describe("everything else", () => {
  it.each([
    "payment_intent.created",
    "charge.succeeded",
    "customer.created",
    "checkout.session.expired",
    "checkout.session.async_payment_failed",
    "invoice.paid",
    "customer.subscription.deleted",
  ])("ignores %s", (type) => {
    // The last two are subscription events. This integration creates no subscriptions, so their
    // arrival would mean something is misconfigured — but ignoring them is still correct, and
    // far better than a 500 that makes Stripe retry forever.
    expect(parseStripeEvent(event(type, { id: "obj_1" }))).toEqual({ type: "other" });
  });
});
