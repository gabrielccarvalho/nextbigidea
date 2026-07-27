# AbacatePay → Stripe migration

**Date:** 2026-07-27
**Status:** implemented

## Context

The payment integration was AbacatePay (Brazilian, PIX/card, BRL). Two problems made this more
than a provider swap:

1. **The layers disagreed about the product.** `lib/viewer-access.ts` implemented a one-time
   purchase — any row with `status = 'paid'` grants access forever, `period_end` deliberately
   ignored. But the adapter created a **real auto-renewing annual subscription**, and the webhook
   carried ~450 lines of period-stacking, renewal, cancellation and refund-restacking arithmetic
   that granted nothing. Customers were being billed yearly for access they already owned
   permanently.

2. **Authentication was structurally weak.** AbacatePay's HMAC signing key is published in their
   public docs and shared by every merchant, so a valid signature proved only that bytes weren't
   altered in transit — never that a callback belonged to *our* account. The real per-account gate
   had to be a `?webhookSecret=` query parameter bolted onto the registered URL.

## Decisions

| Decision | Choice | Consequence |
|---|---|---|
| Billing model | One-time payment (`mode: 'payment'`) | Matches `viewer-access.ts` and the existing "one-time payment" copy. Stripe emits no renewal/cancellation events, so ~450 lines become unreachable and are deleted. |
| Currency & price | **USD $20**, card only | Was R$110. Card-only is configured in the Stripe **Dashboard**, not in code. |
| Checkout surface | Stripe-hosted redirect | Same shape as before, so `paywall-cta.tsx` is unchanged apart from a comment. |
| Price source | `STRIPE_PRICE_ID` env var | Mirrors the old `ABACATEPAY_PRODUCT_ID`. Price changes need no deploy. |
| Subscription machinery | Deleted | Columns retained (additive migration only); nothing writes them. |

### Why `payment_method_types` is never passed

Stripe's guidance is explicit: omitting it enables dynamic payment methods, where the methods
offered are chosen per-customer from the Dashboard configuration. Hardcoding `['card']` would
permanently override that dashboard setting. "Card only" is therefore a **dashboard** setting, not
a code constant.

## Identifier model

This is the subtlest part of the migration and the one place a wrong guess breaks refunds silently.

- `checkout.sessions.create` returns `payment_intent: **null**`. Verified against Stripe's API
  reference: a freshly created `mode: 'payment'` session comes back `status: "open"`,
  `payment_status: "unpaid"`, `payment_intent: null`. **The PaymentIntent id cannot be persisted at
  checkout-creation time.**
- A refund or dispute callback describes a **Charge**, which knows its `payment_intent` but carries
  **no reference to the Checkout Session**.

So the two ids serve different phases and both must be stored:

| Column | Value | Written | Used for |
|---|---|---|---|
| `provider_charge_id` | Checkout Session `cs_…` | At checkout creation | The pending row; the unique index that makes webhook redelivery idempotent |
| `provider_payment_intent_id` | PaymentIntent `pi_…` | On `checkout.session.completed` | The **only** join key a refund or dispute can match on |

`payment_intent_data.metadata.userId` is also set at session creation. Session-level `metadata`
and `client_reference_id` propagate nowhere, but `payment_intent_data.metadata` is snapshotted onto
the PaymentIntent and from there onto the Charge — so a chargeback is traceable to a user even
without a database lookup.

## Events

Exactly four are registered; everything else parses to `other` and returns 200.

| Event | Effect |
|---|---|
| `checkout.session.completed` | Grants access |
| `checkout.session.async_payment_succeeded` | Grants access (delayed payment methods) |
| `charge.refunded` | Revokes — **only when `refunded === true`** (full refund) |
| `charge.dispute.created` | Revokes (chargeback) |

Two guards that are easy to get wrong and are unit-tested:

- Access is gated on `payment_status !== 'unpaid'`, **not** `=== 'paid'`. The third value,
  `no_payment_required`, is what a 100%-off coupon produces; testing for `'paid'` would refuse a
  customer who legitimately completed checkout.
- `charge.refunded` **fires for partial refunds too**, with `refunded: false`. Revoking on the
  event name alone would cut off a customer who received a goodwill partial refund.

## Double-charge prevention

The old guard was a 30-minute time window with a documented KNOWN WEAKNESS: a user returning later
sailed past it and minted a second live subscription. It had to be a guess, because AbacatePay's
create-checkout had already created real recurring billing.

Stripe makes the state observable, so the guard is now **state-based**. On a repeat click the route
retrieves the existing session:

- `open` → return **that same URL**. The customer resumes; only one session is ever payable.
- `complete` → `{ pendingCheckout: true }`. They already paid; the webhook hasn't landed.
- `expired` / unreadable → create a fresh session.

An unread session degrades to `expired` rather than failing the request: the worst case is one
extra open session, which bills nothing, whereas erroring would block a paying customer over a
bookkeeping lookup.

## Preserved from the old integration

The concurrency design was sound and is kept intact: the per-user `pg_advisory_xact_lock` taken
first in every branch, the `FOR UPDATE` re-read under that lock, the `status = 'pending'` predicate
re-asserted on the UPDATE, `onConflictDoNothing` on the unique index, the SQLSTATE-discriminated
error handling (only `23503` foreign-key violations are swallowed; everything else rethrows so
Stripe redelivers), and 503-with-alert for every genuinely unresolvable money event.

## Price drift guard

`assertPriceMatches()` retrieves the configured Price on first checkout and throws unless
`unit_amount` and `currency` match `PRICE_CENTS`/`CURRENCY`. This repo has already shipped a
misconfigured-product bug once with a green build; this makes the equivalent fail loudly. It is
cached per server instance, and rejections are **not** cached so a transient API error can't poison
every later checkout.

`content.test.ts` separately pins `PRICING.amount` to `PRICE_CENTS`, so the advertised price and
the recorded price cannot drift.

## Data migration

**None required.** Access is "any row with `status = 'paid'`", so existing AbacatePay customers keep
access with no backfill. Their rows keep `provider = 'abacatepay'` and `currency = 'BRL'`, which is
what they were actually charged. Migration `0005` is additive: one nullable column, one index, and a
default change from `'BRL'` to `'USD'` that affects only new rows.

**Operational follow-up:** any auto-renewing AbacatePay subscriptions still live must be cancelled
in the AbacatePay dashboard. Nothing in this codebase can stop them — the `cancelSubscription` code
path was already unreachable before this migration and has been deleted.

## Files

**Added:** `lib/payments/stripe.ts`, `lib/payments/stripe.test.ts`,
`packages/db/drizzle/0005_sour_norrin_radd.sql`

**Deleted:** `lib/payments/abacatepay.ts` (+test), `lib/payments/subscription-backfill.ts` (+test),
`lib/billing-period.ts` (+test), `scripts/reconcile-payments.ts`

**Rewritten:** `app/api/payments/webhook/route.ts` (612 → ~300 lines),
`app/api/payments/checkout/route.ts`, `lib/payments/provider.ts`, `e2e/purchase.spec.ts`,
`e2e/support/webhook.ts`

**Copy/legal:** `lib/content.ts` (`amountBRL`/`amountUSDApprox` → `amount`), `app/terms/page.tsx`
(currency clause), `app/privacy/page.tsx` (sub-processor).
