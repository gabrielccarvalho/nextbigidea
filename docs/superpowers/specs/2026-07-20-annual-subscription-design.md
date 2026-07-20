# Annual Subscription Model

**Date:** 2026-07-20
**Status:** Approved, not yet implemented
**Supersedes:** the one-time lifetime purchase model in `2026-07-19-demand-ideas-platform-design.md`

## Summary

Replace the one-time "R$110 lifetime access" purchase with a R$110/year subscription
(marketed as ~$20/year). Access is granted for a fixed one-year period per payment and
lapses when no renewal payment arrives.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Billing currency | R$110/year, marketed as ~$20/year | AbacatePay charges BRL centavos and has no USD amount field. Billing in real USD would require a second payment provider. |
| Renewal mechanism | AbacatePay `frequency: SUBSCRIPTION` | Documented in the API schema. See Risks. |
| Lapse behavior | Hard lock at expiry; the 5 free ideas stay visible | A lapsed subscriber sees exactly what a logged-out visitor sees, plus a renew CTA. No grace period. |
| Existing customers | None — product not launched | Migration is additive with no backfill, and no grandfathering branch is needed. |
| Value cadence in copy | "New ideas every month" | Deliberate under-promise; the pipeline currently runs weekly. |

## Constraint: no cancellation signal

AbacatePay's documented webhook events are `checkout.completed`, `checkout.refunded`,
`checkout.disputed`, `checkout.lost`, and the `transparent.*` equivalents. There is **no**
`subscription.cancelled`, `subscription.renewed`, or `payment.failed` event.

We can therefore observe only *"money arrived"* and *"money was taken back"*. Any design
that stored subscription state (`active` / `canceled` / `past_due`) would drift silently
out of sync with reality, because nothing would ever tell us to leave the `active` state.

This drives the whole design: **absence of a renewal payment is the cancellation signal.**
Access is derived from dated payment facts, never from a stored state machine.

## Data model

Two columns added to `purchases` (`packages/db/src/schema.ts:87`):

```ts
periodStart: timestamp with timezone, nullable
periodEnd:   timestamp with timezone, nullable
```

Each paid row represents one year of access. A renewal is a **new row** with a new
`providerChargeId`, never a mutation of an existing row.

The columns are **nullable because the checkout route inserts a `pending` row before any
money moves**. An abandoned checkout must not carry an access period. Both columns are set
in the same write that flips a row to `status = "paid"` — the webhook's UPDATE, and the
webhook's fallback INSERT, which is the only path that creates an already-paid row.

Invariant: `status = 'paid'` implies both columns are non-null. Worth asserting in the
access query rather than trusting it.

Stacking rule, applied at the moment a row becomes paid:

```
periodStart = max(now, latest existing periodEnd for that user across paid rows)
periodEnd   = periodStart + 1 year
```

An early auto-renewal therefore appends a year rather than overwriting the remaining time.

`status` keeps its existing values (`pending | paid | refunded`). No new states.

### Why period lives on the purchase row

Idempotency. A retried webhook collides with the existing unique index on
`providerChargeId` and does nothing. A user-level `accessExpiresAt` counter incremented by
365 days would double-extend on every provider retry — and AbacatePay retries.

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
to "`max(periodEnd)` where `userId = ? and status = 'paid'`", and passes that result into
`computeAccess`.

The three consumers — `app/ideas/page.tsx`, `app/ideas/[slug]/page.tsx`,
`app/account/page.tsx` — need no logic change; they read `hasFullAccess`. A lapsed user
falls through to the logged-out path, which is what keeps the free ideas visible.

## Checkout

- `lib/payments/provider.ts:5` — `PRICE_CENTS = 11000` keeps its value; the comment becomes
  `R$110/year ≈ $20/year`.
- `lib/payments/abacatepay.ts:104` — send `frequency: "SUBSCRIPTION"` on checkout create.
- `app/api/payments/checkout/route.ts:15-25` — the current `alreadyPaid` guard rejects any
  second charge forever, which would block every renewal. It becomes an **active-access**
  guard: reject only while `periodEnd > now`, returning `{ alreadyActive: true, periodEnd }`.
  Once access has lapsed, checkout proceeds normally.
- `components/paywall-cta.tsx:9` — existing bug: the response shape `{ alreadyPaid: true }`
  is ignored, producing `window.location.href = undefined`. Fixed as part of this work,
  against the new `alreadyActive` shape.

## Webhooks

`parseAbacateEvent` (`lib/payments/abacatepay.ts:50-65`) currently maps `*.completed` to
`paid` and everything else to `other`. Add `checkout.refunded`, `checkout.disputed`, and
`checkout.lost` to a `refunded` event type.

In `app/api/payments/webhook/route.ts`, a `refunded` event sets that charge's row to
`status = "refunded"`, which removes it from the access query automatically. No separate
revocation path exists or is needed.

Renewals require no new webhook code: a renewal arrives as another `checkout.completed`
with a fresh `providerChargeId` and flows through the existing insert path, picking up the
stacking rule above.

## Copy changes

All customer-facing text moves from "lifetime" to "per year":

- `app/page.tsx:18-20` — landing pricing bullet
- `components/paywall-cta.tsx:21,23` — heading and subheading
- `app/account/page.tsx:22-25` — status line, plus a renewal date
- `app/ideas/[slug]/page.tsx:36-38` — locked-idea message
- `apps/web/.env.example:14-17` — product-creation instructions
- `lib/payments/abacatepay.ts:93` — error string mentioning lifetime

Not touched: the `$` figures in `components/idea-card.tsx:18` and
`app/ideas/[slug]/page.tsx:61,73` are idea MRR estimates, not pricing.

## Testing

- `lib/access.test.ts` — rewritten for the new signature: active period, expired period,
  boundary (`periodEnd === now` → locked), and `null` (never purchased).
- `lib/payments/abacatepay.test.ts` — new cases for refund/dispute/lost event parsing.
- New: the stacking rule as a pure, directly tested function. Double-extending or
  overwriting a remaining period is the expensive silent failure here, so it gets coverage
  independent of the webhook route.

## Risks

**`frequency: SUBSCRIPTION` is unverified against the live API.** It appears in AbacatePay's
documented checkout schema, but we have no sandbox evidence that renewals actually fire a
second `checkout.completed`. This must be confirmed with a real test charge before launch.

The expiry-stamp design degrades safely: if auto-renewal silently never happens, access
simply lapses at `periodEnd` and the user can buy another year through the normal checkout
flow. No data corruption, no stuck state — just a worse funnel.

## Out of scope

The application has no transactional email at all beyond the magic-link sign-in
(`lib/auth.ts:18-30`) — no receipt, no renewal reminder, no dunning. An annual plan would
benefit from a "renews in 7 days" notice. Deferred to a separate piece of work.
