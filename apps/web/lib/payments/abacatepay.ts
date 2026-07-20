import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutResult, PaymentEvent, PaymentProvider } from "./provider";

const BASE_URL = "https://api.abacatepay.com/v2";

// Published verbatim in AbacatePay's docs as the key used to HMAC-sign every webhook payload:
// https://docs.abacatepay.com/pages/webhooks and https://docs.abacatepay.com/pages/webhooks/security
// (both pages show the identical constant). It is NOT a per-merchant secret — every AbacatePay
// integrator is documented to use this same value, so on its own it only proves the payload
// wasn't corrupted in transit; it does NOT prove a given callback belongs to *this* account
// (anyone who read the docs has this key too). Overridable via env in case AbacatePay rotates
// it or issues per-account keys in the future.
const ABACATEPAY_HMAC_PUBLIC_KEY =
  process.env.ABACATEPAY_HMAC_PUBLIC_KEY ??
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

/**
 * Pure, constant-time HMAC-SHA256 verification. AbacatePay signs the exact raw request-body
 * bytes and sends the digest **base64**-encoded (not hex) in the `X-Webhook-Signature` header.
 * Returns `false` whenever `signature` is null/absent — verification must never be skipped.
 */
export function verifyHmac(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(Buffer.from(rawBody, "utf8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Constant-time comparison for the URL-borne webhook secret (see PaymentProvider docs). */
export function constantTimeEqual(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type AbacateChargeLike = { id?: string; externalId?: string };

/**
 * Parses AbacatePay's real v2 webhook envelope:
 *   { event, apiVersion, devMode, data: { checkout | transparent: { id, externalId, ... }, ... } }
 * `checkout.completed` nests the charge under `data.checkout`; `transparent.completed` (direct
 * PIX/boleto charges) nests it under `data.transparent`. Deliberately tolerant of unknown/extra
 * fields — AbacatePay's own docs advise against fully validating the payload shape so future
 * additions don't break this endpoint.
 */
export function parseAbacateEvent(body: unknown): PaymentEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as {
    event?: unknown;
    data?: { checkout?: AbacateChargeLike; transparent?: AbacateChargeLike };
  };
  if (typeof b.event !== "string") return null;
  const record = b.data?.checkout ?? b.data?.transparent;
  if (!record || typeof record.id !== "string" || record.id.length === 0) return null;
  const paid = b.event === "checkout.completed" || b.event === "transparent.completed";
  return {
    type: paid ? "paid" : "other",
    providerChargeId: record.id,
    externalId: typeof record.externalId === "string" ? record.externalId : undefined,
  };
}

export class AbacatePayProvider implements PaymentProvider {
  readonly name = "abacatepay";

  constructor(
    private apiKey = process.env.ABACATEPAY_API_KEY ?? "",
    // AbacatePay checkouts reference a pre-created Product by id (POST /v2/products/create or
    // the dashboard) rather than accepting inline product fields at checkout time. The lifetime
    // -access product (price 11000 BRL cents) must be created once ahead of launch and its
    // returned `id` set here.
    private productId = process.env.ABACATEPAY_PRODUCT_ID ?? "",
    private hmacKey = ABACATEPAY_HMAC_PUBLIC_KEY,
    // The actual per-account authentication boundary: the secret configured when the webhook
    // was registered in the AbacatePay dashboard, echoed back as `?webhookSecret=` on every
    // callback URL. Required — verifyAndParseWebhook refuses to verify anything without it.
    private webhookUrlSecret = process.env.ABACATEPAY_WEBHOOK_SECRET ?? "",
  ) {}

  async createCheckout(input: {
    userId: string;
    amountCents: number;
    returnUrl: string;
    completionUrl: string;
  }): Promise<CheckoutResult> {
    if (!this.productId) {
      throw new Error(
        "ABACATEPAY_PRODUCT_ID is not configured. Create the lifetime-access product once " +
          "(AbacatePay dashboard or POST /v2/products/create with price=11000, currency=BRL) " +
          "and set the returned id as ABACATEPAY_PRODUCT_ID.",
      );
    }
    const res = await fetch(`${BASE_URL}/checkouts/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        // amountCents is not sent directly — AbacatePay charges the referenced product's own
        // fixed price. It's kept on the PaymentProvider interface for providers (Stripe, etc.)
        // that do take it directly.
        items: [{ id: this.productId, quantity: 1 }],
        methods: ["PIX"],
        externalId: input.userId,
        returnUrl: input.returnUrl,
        completionUrl: input.completionUrl,
      }),
    });
    const json = (await res.json()) as {
      data?: { url?: string; id?: string };
      error?: unknown;
    };
    if (!res.ok || !json.data?.url || !json.data.id) {
      throw new Error(`abacatepay checkout failed: ${JSON.stringify(json.error ?? json)}`);
    }
    return { url: json.data.url, providerChargeId: json.data.id };
  }

  verifyAndParseWebhook(
    rawBody: string,
    signature: string | null,
    urlSecret?: string | null,
  ): PaymentEvent | null {
    // Gate 1 — the real authentication boundary. Refuse outright if we have no secret to check
    // against (misconfiguration must fail closed, never open).
    if (!this.webhookUrlSecret) return null;
    if (!constantTimeEqual(urlSecret, this.webhookUrlSecret)) return null;
    // Gate 2 — body-integrity check via HMAC.
    if (!verifyHmac(rawBody, signature, this.hmacKey)) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }
    return parseAbacateEvent(parsed);
  }
}
