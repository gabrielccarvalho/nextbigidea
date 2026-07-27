import Stripe from "stripe";
import { CURRENCY, PRICE_CENTS } from "./provider";
import type { CheckoutResult, PaymentEvent, PaymentProvider } from "./provider";

/**
 * Stripe adapter for the one-time purchase model.
 *
 * Two things differ fundamentally from the AbacatePay adapter this replaced, and both remove
 * whole classes of bug rather than relocating them:
 *
 *  1. AUTHENTICATION IS REAL. AbacatePay's HMAC key was published in their public docs and
 *     shared by every merchant, so it proved only that bytes weren't altered in transit — the
 *     actual per-account gate had to be a `?webhookSecret=` query param bolted onto the URL.
 *     Stripe signs with a secret unique to this endpoint (`STRIPE_WEBHOOK_SECRET`, shown once
 *     when the endpoint is created), so the signature alone authenticates both integrity AND
 *     ownership. There is no second gate to get wrong, and the secret is never in a URL.
 *
 *  2. NO SUBSCRIPTION EXISTS. `mode: "payment"` charges once and creates nothing recurring, so
 *     Stripe emits no renewal, cancellation or payment-failure callbacks — the events the old
 *     integration spent ~450 lines reconciling against an access model that ignored them.
 *
 * A note on what is deliberately NOT passed: `payment_method_types`. Omitting it enables
 * Stripe's dynamic payment methods, where the methods offered are configured in the Dashboard
 * (Settings → Payment methods) and chosen per-customer for conversion. Hardcoding `["card"]`
 * here would silently override that dashboard configuration forever.
 */

const PROVIDER_NAME = "stripe";

/**
 * Groups these sessions in Stripe's Dashboard for checkout-funnel comparison. Must stay STABLE
 * across deploys — it is a grouping key, not a nonce, so regenerating the suffix would split
 * this integration's history into two unrelated buckets.
 */
const INTEGRATION_IDENTIFIER = "nextbigidea-access-qhxvbmtd";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Checkout cannot run without it — see apps/web/.env.example.`,
    );
  }
  return value;
}

/**
 * Constructed lazily, NOT at module scope. `new Stripe(undefined)` throws synchronously when
 * the key is unset, and at module scope that throw fires during `next build`'s page-data
 * collection — failing the ENTIRE app build, not just this route, on any deploy that hasn't set
 * the key yet. Mirrors the lazy `new Resend()` in lib/payments/alert.ts and lib/auth.ts.
 *
 * `apiVersion` is deliberately not passed: the SDK defaults to the exact version its own types
 * were generated from (2026-06-24.dahlia for stripe@22). Pinning a different string would make
 * every response type in this file a lie the compiler still accepts.
 */
let cachedClient: Stripe | null = null;
function client(): Stripe {
  if (!cachedClient) cachedClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return cachedClient;
}

/**
 * Asserts the configured Stripe Price still charges what this codebase thinks it charges.
 *
 * This exists because of a bug this repo has already shipped once: the AbacatePay product id
 * pointed at a misconfigured product, every test stayed green, and the failure only surfaced in
 * production. `PRICE_CENTS` drives what gets RECORDED on the purchase row and what the
 * marketing copy promises, while the Price object drives what the customer is actually CHARGED.
 * Nothing but this check couples them, so without it someone editing the price in Stripe's
 * dashboard silently makes the site quote one number and the card statement show another.
 *
 * Cached as a resolved promise so it costs one API call per server instance, not one per
 * checkout. A rejection is not cached — a transient API failure must not poison every
 * subsequent checkout for the life of the process.
 */
let priceCheck: Promise<void> | null = null;
async function assertPriceMatches(): Promise<void> {
  if (!priceCheck) {
    priceCheck = (async () => {
      const price = await client().prices.retrieve(requireEnv("STRIPE_PRICE_ID"));
      if (price.unit_amount !== PRICE_CENTS || price.currency !== CURRENCY) {
        throw new Error(
          `STRIPE_PRICE_ID charges ${price.unit_amount} ${price.currency} but this app records ` +
            `and advertises ${PRICE_CENTS} ${CURRENCY}. Fix the Price in Stripe, or update ` +
            `PRICE_CENTS in lib/payments/provider.ts and PRICING.amount in lib/content.ts.`,
        );
      }
      if (!price.active) {
        throw new Error(`STRIPE_PRICE_ID refers to an archived Price; checkout would fail.`);
      }
    })().catch((err) => {
      priceCheck = null;
      throw err;
    });
  }
  return priceCheck;
}

/** Narrows Stripe's `string | Expandable<T> | null` unions down to the bare id. */
function idOf(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}

/**
 * Exported for unit testing. Pure: no client, no network, no env — which is why the tests can
 * cover every branch without a Stripe key. Signature verification is deliberately NOT part of
 * this function; it happens before this is ever called.
 */
export function parseStripeEvent(event: Stripe.Event): PaymentEvent {
  switch (event.type) {
    // `completed` fires when the Session finishes. For a card that means the money is captured
    // and `payment_status` is already "paid". Payment methods with delayed notification finish
    // the Session while still "unpaid" and settle later via `async_payment_succeeded`, so both
    // events route here and the `payment_status` guard below — not the event name — is what
    // decides whether access is granted. Card-only today, but a payment method enabled in the
    // Dashboard tomorrow must not be able to grant access before the funds clear.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      // `!== "unpaid"` rather than `=== "paid"`, which is the form Stripe's own fulfillment
      // reference uses. The third value is `no_payment_required`, which a 100%-off coupon
      // produces — testing for `"paid"` would silently refuse to grant access to someone who
      // completed checkout legitimately, and the only symptom would be a customer complaint.
      if (session.payment_status === "unpaid") return { type: "other" };
      return {
        type: "paid",
        providerChargeId: session.id,
        paymentIntentId: idOf(session.payment_intent),
        // `client_reference_id` is what we set to our user id at checkout creation.
        externalId: session.client_reference_id ?? session.metadata?.userId ?? undefined,
        amountCents: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
      };
    }

    // Refunds and chargebacks are the ONLY things that revoke access.
    //
    // `charge.refunded` also fires for PARTIAL refunds, which must NOT revoke: the customer
    // paid for a thing and got some money back, not none. `charge.refunded === true` is
    // Stripe's own "fully refunded" flag, so gate on it rather than comparing amounts.
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntentId = idOf(charge.payment_intent);
      if (!charge.refunded || !paymentIntentId) return { type: "other" };
      return { type: "refunded", paymentIntentId };
    }

    // A dispute is a chargeback in progress: the funds are already pulled. Treated exactly like
    // a refund, matching the old integration's handling of `checkout.disputed`.
    case "charge.dispute.created": {
      const paymentIntentId = idOf(event.data.object.payment_intent);
      if (!paymentIntentId) return { type: "other" };
      return { type: "refunded", paymentIntentId };
    }

    default:
      return { type: "other" };
  }
}

/**
 * What a previously-created Checkout Session is currently good for.
 *
 *  - `open`     — still payable; hand the customer back this exact URL instead of a new session.
 *  - `complete` — already paid; the webhook just hasn't landed yet.
 *  - `expired`  — nothing in flight; the caller should create a fresh session.
 *
 * A session that cannot be read (deleted, wrong account, API outage, or an id left over from
 * the AbacatePay era that is not a `cs_…` at all) degrades to `expired`. That is the safe
 * direction: the worst outcome is one extra open session, which bills nothing on its own,
 * whereas failing the request would block a paying customer over a bookkeeping lookup.
 */
export type ResumableCheckout =
  | { state: "open"; url: string }
  | { state: "complete" }
  | { state: "expired" };

export async function resumableCheckoutUrl(sessionId: string): Promise<ResumableCheckout> {
  try {
    const session = await client().checkout.sessions.retrieve(sessionId);
    if (session.status === "open" && session.url) return { state: "open", url: session.url };
    if (session.status === "complete") return { state: "complete" };
    return { state: "expired" };
  } catch (err) {
    console.error(`[payments] could not read Checkout Session ${sessionId}:`, err);
    return { state: "expired" };
  }
}

export class StripeProvider implements PaymentProvider {
  readonly name = PROVIDER_NAME;

  async createCheckout(input: {
    userId: string;
    returnUrl: string;
    completionUrl: string;
  }): Promise<CheckoutResult> {
    await assertPriceMatches();

    const session = await client().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: requireEnv("STRIPE_PRICE_ID"), quantity: 1 }],
      success_url: input.completionUrl,
      cancel_url: input.returnUrl,
      // The join back to our user. Stripe echoes this on every Session-scoped event, and it is
      // the fallback the webhook uses when no pending row was written (see the `paid` handler).
      client_reference_id: input.userId,
      metadata: { userId: input.userId },
      // NOT redundant with the two above, and the difference is documented Stripe behaviour:
      // Session-level `metadata` and `client_reference_id` live on the Session and propagate
      // NOWHERE. Only `payment_intent_data.metadata` is snapshotted onto the PaymentIntent and
      // from there onto the Charge — which is the object a refund or dispute callback carries.
      // Setting it here is what leaves a trail from a chargeback back to a user without a
      // database lookup, and it is the reason a refund is still diagnosable if the
      // PaymentIntent id was never stored.
      payment_intent_data: { metadata: { userId: input.userId } },
      integration_identifier: INTEGRATION_IDENTIFIER,
    });

    if (!session.url) {
      // Only reachable for `ui_mode: "embedded"` sessions, which this integration never creates.
      // Failing loudly beats redirecting the browser to `undefined`.
      throw new Error(`Stripe Checkout Session ${session.id} was created without a hosted URL.`);
    }

    return { url: session.url, providerChargeId: session.id };
  }

  async verifyAndParseWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<PaymentEvent | null> {
    // Configuration is resolved BEFORE the try block, and that placement is load-bearing.
    //
    // `null` from this method means "reject permanently" — the route answers 400 and Stripe
    // never redelivers. That is the right answer for a forged callback and the CATASTROPHIC
    // answer for an unset environment variable: every genuine payment webhook would be dropped,
    // permanently, while the log claimed the signature was bad. Money collected, nothing
    // recorded, no redelivery to repair it.
    //
    // A missing key is an operator error, not a bad callback, so it must throw past this method
    // and 500 the route — which Stripe retries, and which is loud. Only a real verification
    // failure below returns null.
    const stripe = client();
    const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");

    if (!signature) return null;

    let event: Stripe.Event;
    try {
      // Throws StripeSignatureVerificationError on a bad signature, a malformed header, or a
      // timestamp outside the default 5-minute tolerance — which is also the replay defence.
      //
      // The `…Async` variant is chosen over the synchronous `constructEvent` deliberately: both
      // work on the Node runtime this route uses today, but only the async one works under a
      // SubtleCrypto-backed provider. That keeps this route portable if it is ever moved to a
      // runtime without synchronous crypto, at no cost here.
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error(`[payments] rejected a webhook that failed signature verification:`, err);
      return null;
    }

    return parseStripeEvent(event);
  }
}
