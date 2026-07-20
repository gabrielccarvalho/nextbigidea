import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AbacatePayProvider, constantTimeEqual, parseAbacateEvent, verifyHmac } from "./abacatepay";

const SECRET = "whsec_test";

// AbacatePay signs the raw body with HMAC-SHA256, base64-encoded, in the
// `X-Webhook-Signature` header. See:
// https://docs.abacatepay.com/pages/webhooks (section "Exemplo de validação HMAC (Node.js)")
function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("base64");
}

describe("verifyHmac", () => {
  it("accepts a correctly signed body", () => {
    const body = '{"event":"checkout.completed"}';
    const sig = sign(body, SECRET);
    expect(verifyHmac(body, sig, SECRET)).toBe(true);
  });

  it("rejects a bad signature", () => {
    expect(verifyHmac('{"x":1}', "deadbeef", SECRET)).toBe(false);
  });

  it("rejects a null signature", () => {
    expect(verifyHmac("{}", null, SECRET)).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = '{"event":"checkout.completed"}';
    const sig = sign(body, "some-other-secret");
    expect(verifyHmac(body, sig, SECRET)).toBe(false);
  });

  it("rejects a hex-encoded signature (AbacatePay uses base64, not hex)", () => {
    const body = '{"event":"checkout.completed"}';
    const hexSig = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyHmac(body, hexSig, SECRET)).toBe(false);
  });

  it("rejects a body that was tampered with after signing", () => {
    const body = '{"event":"checkout.completed"}';
    const sig = sign(body, SECRET);
    expect(verifyHmac('{"event":"checkout.refunded"}', sig, SECRET)).toBe(false);
  });
});

// constantTimeEqual is the REAL authentication gate: AbacatePay's HMAC key is a public
// constant shared by every merchant (see abacatepay.ts), so the ?webhookSecret= comparison
// this function performs is the only thing separating real callbacks from forged ones.
describe("constantTimeEqual", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("whsec_test", "whsec_test")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(constantTimeEqual("whsec_test", "whsec_fake")).toBe(false);
  });

  it("returns false for different strings of different lengths, without throwing", () => {
    expect(() => constantTimeEqual("short", "a-much-longer-secret")).not.toThrow();
    expect(constantTimeEqual("short", "a-much-longer-secret")).toBe(false);
  });

  it("returns false for null", () => {
    expect(constantTimeEqual(null, "whsec_test")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(constantTimeEqual(undefined, "whsec_test")).toBe(false);
  });

  // The case that matters most: if ABACATEPAY_WEBHOOK_SECRET is unset, `b` is "". A request
  // with no ?webhookSecret= param at all must NOT be treated as authenticated.
  it("returns false when both sides are empty strings (unset secret must never authenticate an empty query param)", () => {
    expect(constantTimeEqual("", "")).toBe(false);
  });

  it("returns false when the provided secret is empty but the real secret is not", () => {
    expect(constantTimeEqual("", "whsec_test")).toBe(false);
  });
});

describe("parseAbacateEvent", () => {
  // Real AbacatePay v2 webhook envelope for `checkout.completed`:
  // { event, apiVersion, devMode, data: { checkout: { id, externalId, ... }, customer, payerInformation } }
  it("maps a completed checkout to a paid event", () => {
    const ev = parseAbacateEvent({
      event: "checkout.completed",
      apiVersion: 2,
      devMode: false,
      data: {
        checkout: { id: "bill_abc123xyz", externalId: "user_abc", status: "PAID" },
        customer: { id: "cust_abc123", name: "Jane Doe", email: "jane@example.com" },
      },
    });
    expect(ev).toEqual({ type: "paid", providerChargeId: "bill_abc123xyz", externalId: "user_abc" });
  });

  // transparent.completed nests under data.transparent instead of data.checkout.
  it("maps a completed transparent (PIX) charge to a paid event", () => {
    const ev = parseAbacateEvent({
      event: "transparent.completed",
      apiVersion: 2,
      devMode: false,
      data: { transparent: { id: "char_xyz789", externalId: "user_def", status: "PAID" } },
    });
    expect(ev).toEqual({ type: "paid", providerChargeId: "char_xyz789", externalId: "user_def" });
  });

  it("maps a refund event to a refunded event", () => {
    const ev = parseAbacateEvent({
      event: "checkout.refunded",
      data: { checkout: { id: "bill_abc123xyz" } },
    });
    expect(ev?.type).toBe("refunded");
  });

  it("returns null on unrecognized shape", () => {
    expect(parseAbacateEvent({ nope: true })).toBeNull();
  });

  it("returns null when the charge id is missing", () => {
    expect(parseAbacateEvent({ event: "checkout.completed", data: {} })).toBeNull();
  });

  it("returns null for a non-object body", () => {
    expect(parseAbacateEvent(null)).toBeNull();
    expect(parseAbacateEvent("checkout.completed")).toBeNull();
  });
});

// The three guards above are each tested in isolation. These tests cover their
// COMPOSITION and ORDERING inside verifyAndParseWebhook, which is what actually
// decides whether a callback can grant someone lifetime access.
describe("AbacatePayProvider.verifyAndParseWebhook", () => {
  const HMAC_KEY = "hmac_public_test_key";
  const URL_SECRET = "url_secret_test";
  const BODY = JSON.stringify({
    event: "checkout.completed",
    data: { checkout: { id: "chk_123", externalId: "user_abc" } },
  });

  function provider(webhookUrlSecret = URL_SECRET) {
    // (apiKey, productId, hmacKey, webhookUrlSecret)
    return new AbacatePayProvider("key_test", "prod_test", HMAC_KEY, webhookUrlSecret);
  }

  it("accepts a request with both the correct URL secret and a correct signature", () => {
    const event = provider().verifyAndParseWebhook(BODY, sign(BODY, HMAC_KEY), URL_SECRET);
    expect(event).toEqual({ type: "paid", providerChargeId: "chk_123", externalId: "user_abc" });
  });

  // THE case the whole design rests on. AbacatePay's HMAC key is published in their
  // docs and shared by every merchant, so anyone can produce a valid signature. If a
  // correct HMAC could bypass the URL-secret gate, the webhook would be forgeable by
  // anyone who read the docs, and they could grant themselves lifetime access free.
  it("rejects a perfectly signed request bearing the WRONG URL secret", () => {
    const validSignature = sign(BODY, HMAC_KEY);
    expect(provider().verifyAndParseWebhook(BODY, validSignature, "wrong_secret")).toBeNull();
  });

  it("rejects a request with the correct URL secret but a wrong signature", () => {
    expect(provider().verifyAndParseWebhook(BODY, sign(BODY, "other_key"), URL_SECRET)).toBeNull();
  });

  it("rejects when no URL secret is supplied at all", () => {
    expect(provider().verifyAndParseWebhook(BODY, sign(BODY, HMAC_KEY), null)).toBeNull();
    expect(provider().verifyAndParseWebhook(BODY, sign(BODY, HMAC_KEY), undefined)).toBeNull();
  });

  // Fails CLOSED on a misconfigured deploy: an unset ABACATEPAY_WEBHOOK_SECRET must not
  // become "no secret required", which an attacker would trigger with `?webhookSecret=`.
  it("rejects everything when the configured webhook secret is empty", () => {
    const unconfigured = provider("");
    expect(unconfigured.verifyAndParseWebhook(BODY, sign(BODY, HMAC_KEY), "")).toBeNull();
    expect(unconfigured.verifyAndParseWebhook(BODY, sign(BODY, HMAC_KEY), URL_SECRET)).toBeNull();
  });

  it("returns null rather than throwing on a malformed body that passes both gates", () => {
    const malformed = "{not json";
    const event = provider().verifyAndParseWebhook(
      malformed,
      sign(malformed, HMAC_KEY),
      URL_SECRET,
    );
    expect(event).toBeNull();
  });
});

// Payload shapes taken from https://docs.abacatepay.com/pages/webhooks/events/subscriptions
describe("parseAbacateEvent — subscriptions", () => {
  it("parses subscription.completed, capturing both ids and the user", () => {
    expect(
      parseAbacateEvent({
        id: "log_taQArRTApemxwcbw5EJeF3hS",
        event: "subscription.completed",
        apiVersion: 2,
        devMode: false,
        data: {
          subscription: { id: "subs_tAFq", status: "ACTIVE", frequency: "ANNUALLY" },
          customer: { id: "cust_def456" },
          checkout: { id: "bill_first123", externalId: "user_abc", status: "PAID" },
        },
      }),
    ).toEqual({
      type: "paid",
      providerChargeId: "bill_first123",
      providerSubscriptionId: "subs_tAFq",
      externalId: "user_abc",
    });
  });

  // THE load-bearing case. AbacatePay generates the renewal checkout itself, so it carries
  // `externalId: null` — the user is NOT resolvable from this payload. If parsing drops the
  // subscription id, every renewal verifies, parses, and then extends nobody's access.
  it("parses subscription.renewed and keeps the subscription id despite a null externalId", () => {
    expect(
      parseAbacateEvent({
        id: "log_abc123xyz",
        event: "subscription.renewed",
        apiVersion: 2,
        devMode: false,
        data: {
          subscription: { id: "subs_tAFq", status: "ACTIVE", frequency: "ANNUALLY" },
          customer: { id: "cust_def456" },
          checkout: { id: "bill_renewxyz789", externalId: null, status: "PAID" },
        },
      }),
    ).toEqual({
      type: "renewed",
      providerChargeId: "bill_renewxyz789",
      providerSubscriptionId: "subs_tAFq",
    });
  });

  // The absence of `providerChargeId` here is the whole point, not an omission: it is what
  // makes "cancellation revokes access" structurally impossible to write. Every revocation
  // path keys on a charge id, so a cancelled event has nothing to revoke. Enforced by the
  // PaymentEvent union at compile time; asserted here so a well-meaning future edit that
  // "helpfully" adds the charge id fails loudly.
  it("parses subscription.cancelled with its reason and no charge id", () => {
    expect(
      parseAbacateEvent({
        event: "subscription.cancelled",
        data: {
          subscription: {
            id: "subs_tAFq",
            status: "CANCELLED",
            canceledAt: "2026-07-20T12:00:00.000Z",
            cancelledDueTo: "max_payment_retries_exceeded",
          },
        },
      }),
    ).toEqual({
      type: "cancelled",
      providerSubscriptionId: "subs_tAFq",
      cancelledDueTo: "max_payment_retries_exceeded",
    });
  });

  it("parses subscription.payment_failed", () => {
    expect(
      parseAbacateEvent({
        event: "subscription.payment_failed",
        data: {
          subscription: { id: "subs_tAFq", status: "ACTIVE" },
          payment: { status: "FAILED", reason: "card_declined" },
        },
      }),
    ).toEqual({ type: "payment_failed", providerSubscriptionId: "subs_tAFq" });
  });

  it("returns null when a subscription event has no subscription id", () => {
    expect(parseAbacateEvent({ event: "subscription.renewed", data: { subscription: {} } })).toBeNull();
  });

  it("maps refund, dispute and loss to a single refunded event", () => {
    for (const event of ["checkout.refunded", "checkout.disputed", "checkout.lost"]) {
      expect(parseAbacateEvent({ event, data: { checkout: { id: "bill_x" } } })).toEqual({
        type: "refunded",
        providerChargeId: "bill_x",
      });
    }
  });

  it("maps transparent refunds to refunded too", () => {
    expect(
      parseAbacateEvent({ event: "transparent.refunded", data: { transparent: { id: "pix_x" } } }),
    ).toEqual({ type: "refunded", providerChargeId: "pix_x" });
  });

  it("ignores trial and plan-change events", () => {
    for (const event of ["subscription.trial_started", "subscription.plan_changed"]) {
      expect(
        parseAbacateEvent({ event, data: { subscription: { id: "subs_tAFq" } } }),
      ).toEqual({ type: "other" });
    }
  });
});
