import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { parseStripeEvent } from "./stripe";

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
