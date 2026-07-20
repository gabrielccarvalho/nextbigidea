# Annual Subscription Model

**Date:** 2026-07-20
**Status:** Approved, not yet implemented
**Supersedes:** the one-time lifetime purchase model in `2026-07-19-demand-ideas-platform-design.md`
**Source of truth:** https://docs.abacatepay.com/llms-full.txt (fetched 2026-07-20)

## Summary

Replace the one-time "R$110 lifetime access" purchase with a R$110/year subscription
(marketed as ~$20/year), using AbacatePay's native recurring-subscription API. Access is
granted for a one-year period per successful payment and lapses when no renewal arrives.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Billing currency | R$110/year, marketed as ~$20/year | AbacatePay charges BRL centavos and has no USD amount field. Billing in real USD would require a second payment provider. |
| Renewal mechanism | Native AbacatePay subscriptions (`POST /subscriptions/create`) | Confirmed against live docs. Full lifecycle webhooks exist. |
| Lapse behavior | Hard lock at period end; the 5 free ideas stay visible | A lapsed subscriber sees exactly what a logged-out visitor sees, plus a renew CTA. No grace period. |
| Existing customers | None — product not launched | Migration is additive with no backfill, and no grandfathering branch is needed. |
| Value cadence in copy | "New ideas every month" | Deliberate under-promise; the pipeline currently runs weekly. |

## Correction to the prior draft

An earlier version of this spec asserted that AbacatePay emits no cancellation or renewal
webhooks, and designed around that constraint. **That was wrong** — it came from stale
project notes rather than the live documentation.

The live docs list a complete subscription lifecycle:

| Event | Fires when |
|---|---|
| `subscription.completed` | Subscription created and activated (first payment) |
| `subscription.renewed` | A recurring charge was paid |
| `subscription.cancelled` | Subscription cancelled (manually or by retry exhaustion) |
| `subscription.payment_failed` | A recurring charge attempt failed; carries `retryNumber` |
| `subscription.trial_started` | Trial period began (unused here) |
| `subscription.plan_changed` | Plan upgraded/downgraded (unused here) |

Plus the existing `checkout.*` and `transparent.*` events, and management endpoints
`POST /subscriptions/cancel`, `/change-plan`, `/record-usage`.

The expiry-stamp design below survives this correction, but for a better reason than
originally given: cancellation in AbacatePay is *immediate and irreversible*, stopping all
future charges. Deriving access from paid periods means a cancelling customer keeps what
they paid for until their period ends, with no extra code. See "Why not store subscription
state".

## AbacatePay integration

### Product (manual, one-time setup)

The existing R$110 product **cannot be reused.** A subscription checkout requires a product
with a `cycle`; one-off (`avulso`) products return an error. Create a new product:

```json
POST /products/create
{
  "externalId": "nbt-annual",
  "name": "Next Big Thing — Acesso Anual",
  "price": 11000,
  "currency": "BRL",
  "cycle": "ANNUALLY"
}
```

`cycle` accepts `WEEKLY | MONTHLY | QUARTERLY | SEMIANNUALLY | ANNUALLY`.

> Doc inconsistency: the glossary page lists cycles as `WEEKLY | MONTHLY | YEARLY`, while the
> product reference and the subscription-create prerequisite both say `ANNUALLY`. Use
> `ANNUALLY` — it appears in the two authoritative places. Verify on first product create.

The returned `data.id` replaces `ABACATEPAY_PRODUCT_ID`.

### Creating a subscription

`createCheckout` switches endpoint from `POST /checkouts/create` to
`POST /subscriptions/create`. Same parameter shape (`items`, `customerId`, `externalId`,
`returnUrl`, `completionUrl`, `methods`, `metadata`), with two differences: exactly one
product is allowed, and the cycle comes from the product rather than the request. We
continue sending `externalId: userId` and `methods: ["CARD"]`.

Add an explicit `retryPolicy`:

```json
"retryPolicy": { "maxRetry": 3, "retryEvery": 2 }
```

After `maxRetry` failed attempts AbacatePay auto-cancels the subscription and fires
`subscription.cancelled` with `cancelledDueTo: "max_payment_retries_exceeded"`.

### The renewal identity problem

**Renewal webhooks cannot be mapped to a user via `externalId`.** In the documented
`subscription.renewed` payload, the auto-generated renewal checkout carries
`"externalId": null` — our user id is present only on the checkout the customer actually
went through.

Renewals must therefore be keyed on `data.subscription.id` (e.g.
`subs_tAFqDWBhcEYTjQh2K0ZYDHau`), captured during `subscription.completed`, where
`externalId` *is* present.

This is the single most dangerous detail in the integration: without it, renewals arrive,
verify, parse, and then silently fail to extend anyone's access.

## Data model

Three columns added to `purchases` (`packages/db/src/schema.ts:87`):

```ts
providerSubscriptionId: text, nullable, indexed
periodStart:            timestamp with timezone, nullable
periodEnd:              timestamp with timezone, nullable
```

Each paid row represents one year of access. A renewal is a **new row** with a new
`providerChargeId` and the same `providerSubscriptionId`, never a mutation of an existing
row.

`providerSubscriptionId` is the join key for renewals, per the identity problem above. It
is nullable because the `pending` row is written before a subscription exists, and indexed
because every renewal webhook looks up by it.

The period columns are nullable because the checkout route inserts a `pending` row before
any money moves — an abandoned checkout must not carry an access period. Both are set in
the same write that flips a row to `status = "paid"`.

Invariant: `status = 'paid'` implies both period columns are non-null. Asserted in the
access query rather than trusted.

Stacking rule, applied at the moment a row becomes paid:

```
periodStart = max(now, latest existing periodEnd for that user across paid rows)
periodEnd   = periodStart + 1 year
```

An early renewal therefore appends a year rather than overwriting remaining time. We
compute this ourselves because the subscription object exposes no `nextBilling` or
period-end field — only `createdAt`, `updatedAt`, `status`, `frequency`, `retryPolicy`,
and (when cancelled) `canceledAt` / `cancelledDueTo`.

`status` keeps its existing values (`pending | paid | refunded`).

### Why not store subscription state

We could now mirror AbacatePay's `ACTIVE`/`CANCELLED` status, since the events exist. We
deliberately don't.

Access is a question about *time paid for*, not about *current billing intent*. A customer
who cancels mid-period has still paid through `periodEnd` and should keep access until
then — which the dated-payment model gives for free, whereas a mirrored status flag would
wrongly revoke immediately. Mirrored state also introduces a class of bug the derived model
cannot have: drift, when an event is missed, retried out of order, or delivered late.

`subscription.cancelled` is therefore recorded but does not revoke access. Only refunds and
chargebacks revoke.

## Access logic

`apps/web/lib/access.ts` — pure, clock injected:

```ts
computeAccess(periodEnd: Date | null, now: Date): {
  hasFullAccess: boolean;
  periodEnd: Date | null;
}
```

`hasFullAccess = periodEnd !== null && periodEnd > now`.

The clock is a parameter, never read inside the function. Reading `new Date()` internally
would make expiry behavior untestable.

`apps/web/lib/viewer-access.ts:11` changes its query from "any row with `status = 'paid'`"
to "`max(periodEnd)` where `userId = ? and status = 'paid'`", passing that into
`computeAccess`.

The three consumers — `app/ideas/page.tsx`, `app/ideas/[slug]/page.tsx`,
`app/account/page.tsx` — need no logic change; they read `hasFullAccess`. A lapsed user
falls through to the logged-out path, which is what keeps the free ideas visible.

## Webhooks

`parseAbacateEvent` (`lib/payments/abacatepay.ts:50-65`) currently recognises only
`checkout.completed` and `transparent.completed`, mapping everything else to `other`. It
gains the subscription lifecycle, and its parsed event type must carry
`subscriptionId` alongside the existing `chargeId` / `externalId`.

| Event | Handling |
|---|---|
| `subscription.completed` | First payment. Resolve user from `externalId`, store `providerSubscriptionId`, set period, `status = "paid"`. |
| `subscription.renewed` | Resolve user by `providerSubscriptionId` (**not** `externalId`). Insert a new paid row, applying the stacking rule. |
| `subscription.payment_failed` | Log only. No access change — the customer keeps their paid period while retries run. |
| `subscription.cancelled` | Record `canceledAt` / `cancelledDueTo` for the account page. **No access change.** |
| `checkout.refunded` / `disputed` / `lost` | Set that charge's row to `status = "refunded"`, which removes it from the access query. |
| everything else | `other`, ignored. |

Register the new events in the AbacatePay dashboard webhook config — the existing webhook
subscribes only to the `checkout.*` set, so renewals would never be delivered otherwise.

Idempotency is unchanged in mechanism: the unique index on `providerChargeId` makes retried
deliveries no-ops. Renewals each carry a distinct charge id, so they insert cleanly.

## Checkout route

- `lib/payments/provider.ts:5` — `PRICE_CENTS = 11000` keeps its value; comment becomes
  `R$110/year ≈ $20/year`.
- `app/api/payments/checkout/route.ts:15-25` — the current `alreadyPaid` guard rejects any
  second charge forever, which would block re-subscribing after a lapse. It becomes an
  **active-access** guard: reject only while `periodEnd > now`, returning
  `{ alreadyActive: true, periodEnd }`. Once access has lapsed, checkout proceeds normally.
- `components/paywall-cta.tsx:9` — existing bug: the response shape `{ alreadyPaid: true }`
  is ignored, producing `window.location.href = undefined`. Fixed against the new
  `alreadyActive` shape.

## Copy changes

All customer-facing text moves from "lifetime" to "per year":

- `app/page.tsx:18-20` — landing pricing bullet
- `components/paywall-cta.tsx:21,23` — heading and subheading
- `app/account/page.tsx:22-25` — status line, plus renewal date and cancellation notice
- `app/ideas/[slug]/page.tsx:36-38` — locked-idea message
- `apps/web/.env.example:14-17` — product-creation instructions (new `cycle: ANNUALLY` product)
- `lib/payments/abacatepay.ts:93` — error string mentioning lifetime

Not touched: the `$` figures in `components/idea-card.tsx:18` and
`app/ideas/[slug]/page.tsx:61,73` are idea MRR estimates, not pricing.

## Testing

- `lib/access.test.ts` — rewritten for the new signature: active period, expired period,
  boundary (`periodEnd === now` → locked), and `null` (never purchased).
- `lib/payments/abacatepay.test.ts` — parsing cases for each subscription event, using the
  documented payloads. Must include a `subscription.renewed` fixture with
  `checkout.externalId: null`, so the renewal-identity bug is caught by the suite rather
  than by a customer.
- New: the stacking rule as a pure, directly tested function. Double-extending or
  overwriting a remaining period is the expensive silent failure here, so it gets coverage
  independent of the webhook route.
- New: a test asserting `subscription.cancelled` does **not** revoke access before
  `periodEnd`.

## Risks

**Renewal identity.** Documented behavior says the renewal checkout's `externalId` is
`null`. If that is wrong in either direction, renewals break or the mapping is redundant.
Verify with a real renewal before trusting it in production.

**No renewal can be observed quickly.** With an `ANNUALLY` cycle, the first real renewal is
a year out. Validate the renewal path against a short-cycle (`WEEKLY`) product in dev mode
before launch; otherwise the most important code path ships completely unexercised.

**Cycle enum inconsistency.** `ANNUALLY` vs `YEARLY` across doc pages — confirm at product
creation.

## Out of scope

The application has no transactional email beyond the magic-link sign-in
(`lib/auth.ts:18-30`) — no receipt, no renewal reminder, no dunning. With
`subscription.payment_failed` now available, dunning email is genuinely feasible and worth
doing, but it is separate work.

Self-service cancellation via `POST /subscriptions/cancel` is likewise deferred; customers
cancel through AbacatePay until an account-page control is built.
