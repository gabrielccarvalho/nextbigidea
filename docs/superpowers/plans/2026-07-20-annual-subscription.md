# Annual Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-time "lifetime access" purchase with a R$110/year AbacatePay subscription, where access is derived from dated paid periods rather than a boolean.

**Architecture:** Each successful payment writes a `purchases` row carrying `periodStart`/`periodEnd` (one year). Access is `max(periodEnd) > now`, never a stored subscription status. Renewals arrive as `subscription.renewed` webhooks and are joined to a user via `providerSubscriptionId`, because renewal payloads carry a null `externalId`.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM + Neon Postgres, Better Auth, Vitest, pnpm workspaces + Turbo.

**Spec:** `docs/superpowers/specs/2026-07-20-annual-subscription-design.md`

## Global Constraints

- Price stays `PRICE_CENTS = 11000` (R$110), currency `"BRL"`. Marketed as "~$20/year".
- Customer-facing copy says **"New ideas every month"** — never "weekly", never "lifetime", never "forever".
- Payment method stays card-only: `methods: ["CARD"]`.
- `apps/web/lib/access.ts` and any other pure module under test MUST NOT import `@workspace/db` — that package throws at import time when `DATABASE_URL` is unset, which breaks the Vitest run.
- Pure functions take `now: Date` as a parameter. Never call `new Date()` inside a function under test.
- Product cycle value is `ANNUALLY` (not `YEARLY`).
- Commands: `pnpm --filter web test`, `pnpm --filter @workspace/db test`, `pnpm typecheck`, `pnpm --filter web build`.

---

## File Structure

**Created:**
- `apps/web/lib/billing-period.ts` — pure period arithmetic (`computeNextPeriod`, `addOneYear`)
- `apps/web/lib/billing-period.test.ts` — its tests
- `packages/db/drizzle/0003_*.sql` — generated migration

**Modified:**
- `packages/db/src/schema.ts:87-107` — three new columns on `purchases`
- `apps/web/lib/access.ts` — `computeAccess` signature gains expiry + clock
- `apps/web/lib/access.test.ts` — rewritten
- `apps/web/lib/payments/provider.ts` — `PaymentEvent` becomes a discriminated union
- `apps/web/lib/payments/abacatepay.ts` — subscription endpoint + subscription event parsing
- `apps/web/lib/payments/abacatepay.test.ts` — subscription event fixtures
- `apps/web/lib/viewer-access.ts` — query `max(periodEnd)`
- `apps/web/app/api/payments/checkout/route.ts` — active-access guard
- `apps/web/app/api/payments/webhook/route.ts` — subscription lifecycle handling
- `apps/web/components/paywall-cta.tsx` — copy + response-shape bug
- `apps/web/app/page.tsx`, `apps/web/app/account/page.tsx`, `apps/web/app/ideas/[slug]/page.tsx` — copy
- `apps/web/.env.example` — product setup instructions

---

## Task 1: Schema — dated access periods

**Files:**
- Modify: `packages/db/src/schema.ts:87-107`
- Create: `packages/db/drizzle/0003_*.sql` (generated)

**Interfaces:**
- Consumes: nothing
- Produces: `purchases.providerSubscriptionId` (`text`, nullable), `purchases.periodStart` (`timestamptz`, nullable), `purchases.periodEnd` (`timestamptz`, nullable), and index `purchases_provider_subscription_idx`.

- [ ] **Step 1: Add the columns**

In `packages/db/src/schema.ts`, replace the `purchases` table definition (currently lines 87-107) with:

```ts
export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // abacatepay
    providerChargeId: text("provider_charge_id").notNull(),
    // AbacatePay's subscription id (subs_...). The join key for renewals: a
    // `subscription.renewed` payload's checkout carries `externalId: null`, so the
    // user CANNOT be resolved from the renewal itself. Captured on
    // `subscription.completed`, where externalId is present.
    providerSubscriptionId: text("provider_subscription_id"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    status: text("status").notNull().default("pending"), // pending | paid | refunded
    // The access window this payment bought. Nullable because the checkout route writes a
    // `pending` row before any money moves — an abandoned checkout must not grant a period.
    // Invariant: status = 'paid' implies both are non-null.
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Payment providers RETRY webhooks. Without this constraint, two concurrent
  // deliveries of the same charge can both pass a check-then-insert and write
  // duplicate paid rows. The unique index makes idempotency a database
  // guarantee rather than a race the application hopes to win.
  (t) => [
    uniqueIndex("purchases_provider_charge_uq").on(t.providerChargeId),
    index("purchases_provider_subscription_idx").on(t.providerSubscriptionId),
  ],
);
```

- [ ] **Step 2: Ensure `index` is imported**

Check the import block at the top of `packages/db/src/schema.ts`. If `index` is not already imported from `drizzle-orm/pg-core`, add it alongside `uniqueIndex`:

```ts
import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
```

Keep any other existing imports on that line (`boolean`, `jsonb`, etc.) — do not delete them.

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @workspace/db db:generate`
Expected: a new file `packages/db/drizzle/0003_<random-name>.sql` containing three `ALTER TABLE "purchases" ADD COLUMN` statements and one `CREATE INDEX`.

- [ ] **Step 4: Verify the generated SQL**

Run: `cat packages/db/drizzle/0003_*.sql`
Expected: contains `ADD COLUMN "provider_subscription_id" text`, `ADD COLUMN "period_start" timestamp with time zone`, `ADD COLUMN "period_end" timestamp with time zone`, and `CREATE INDEX "purchases_provider_subscription_idx"`. All three columns must be nullable — if any has `NOT NULL`, the schema edit was wrong; fix and regenerate.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle
git commit -m "feat(db): add dated access periods and subscription id to purchases"
```

---

## Task 2: Pure access logic — expiry replaces boolean

**Files:**
- Modify: `apps/web/lib/access.ts`
- Test: `apps/web/lib/access.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `computeAccess(periodEnd: Date | null, now: Date): { hasFullAccess: boolean; periodEnd: Date | null }`

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `apps/web/lib/access.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { computeAccess } from "./access";

const NOW = new Date("2026-07-20T12:00:00.000Z");

describe("computeAccess", () => {
  it("grants access while the paid period is still running", () => {
    const periodEnd = new Date("2027-07-20T12:00:00.000Z");
    expect(computeAccess(periodEnd, NOW)).toEqual({ hasFullAccess: true, periodEnd });
  });

  it("denies access once the period has ended", () => {
    const periodEnd = new Date("2026-07-19T12:00:00.000Z");
    expect(computeAccess(periodEnd, NOW)).toEqual({ hasFullAccess: false, periodEnd });
  });

  // Boundary: the period is exclusive at its end. A subscription that ends exactly now
  // is over. Getting this backwards grants a free extra tick of access on every renewal.
  it("denies access at the exact instant the period ends", () => {
    const periodEnd = new Date(NOW);
    expect(computeAccess(periodEnd, NOW)).toEqual({ hasFullAccess: false, periodEnd });
  });

  it("denies access when there is no paid period at all", () => {
    expect(computeAccess(null, NOW)).toEqual({ hasFullAccess: false, periodEnd: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test access.test`
Expected: FAIL — the current `computeAccess(hasPaidPurchase: boolean)` returns `{ hasFullAccess }` with no `periodEnd`, so every assertion mismatches.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `apps/web/lib/access.ts` with:

```ts
// Pure: no DB, no session, no next/headers import. This is the only
// unit-tested piece of the paywall — kept in its own module, free of any
// `@workspace/db` import, because that package throws at import time when
// DATABASE_URL is unset (mirrors the stages/idea.ts vs stages/enrich.ts
// split in packages/pipeline).
//
// Access is derived from the access window a payment bought, never from a stored
// subscription status. A customer who cancels mid-period keeps what they paid for
// until `periodEnd`; a mirrored ACTIVE/CANCELLED flag would revoke immediately and
// would drift whenever an event is missed, retried, or delivered out of order.
//
// `now` is a parameter, never `new Date()` — expiry is untestable otherwise.
export function computeAccess(
  periodEnd: Date | null,
  now: Date,
): { hasFullAccess: boolean; periodEnd: Date | null } {
  return { hasFullAccess: periodEnd !== null && periodEnd.getTime() > now.getTime(), periodEnd };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test access.test`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/access.ts apps/web/lib/access.test.ts
git commit -m "feat(web): derive access from a dated period instead of a paid boolean"
```

---

## Task 3: Pure period arithmetic — the stacking rule

**Files:**
- Create: `apps/web/lib/billing-period.ts`
- Test: `apps/web/lib/billing-period.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `computeNextPeriod(latestPeriodEnd: Date | null, now: Date): { periodStart: Date; periodEnd: Date }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/billing-period.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeNextPeriod } from "./billing-period";

const NOW = new Date("2026-07-20T12:00:00.000Z");

describe("computeNextPeriod", () => {
  it("starts a first subscription at now and ends one year later", () => {
    expect(computeNextPeriod(null, NOW)).toEqual({
      periodStart: NOW,
      periodEnd: new Date("2027-07-20T12:00:00.000Z"),
    });
  });

  // The renewal charge lands a few days BEFORE the current period ends. Starting the new
  // period at `now` would silently burn the remaining days the customer already paid for.
  it("appends to the remaining time when renewing early", () => {
    const currentEnd = new Date("2026-07-25T12:00:00.000Z");
    expect(computeNextPeriod(currentEnd, NOW)).toEqual({
      periodStart: currentEnd,
      periodEnd: new Date("2027-07-25T12:00:00.000Z"),
    });
  });

  it("starts at now when the previous period already lapsed", () => {
    const lapsedEnd = new Date("2026-06-01T12:00:00.000Z");
    expect(computeNextPeriod(lapsedEnd, NOW)).toEqual({
      periodStart: NOW,
      periodEnd: new Date("2027-07-20T12:00:00.000Z"),
    });
  });

  it("starts at now when the previous period ends exactly now", () => {
    expect(computeNextPeriod(new Date(NOW), NOW)).toEqual({
      periodStart: NOW,
      periodEnd: new Date("2027-07-20T12:00:00.000Z"),
    });
  });

  // Feb 29 has no counterpart in a non-leap year. JS rolls forward to Mar 1, which is
  // the behavior we want (never backwards — that would shorten a paid period).
  it("rolls a leap day forward to March 1", () => {
    const leapDay = new Date("2028-02-29T12:00:00.000Z");
    expect(computeNextPeriod(null, leapDay).periodEnd).toEqual(
      new Date("2029-03-01T12:00:00.000Z"),
    );
  });

  it("does not mutate its inputs", () => {
    const end = new Date("2026-07-25T12:00:00.000Z");
    const snapshot = end.getTime();
    computeNextPeriod(end, NOW);
    expect(end.getTime()).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test billing-period`
Expected: FAIL — "Failed to resolve import ./billing-period" (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/billing-period.ts`:

```ts
// Pure: no DB import (see access.ts for why that matters for the test run).
//
// AbacatePay's subscription object exposes no `nextBilling` or period-end field — only
// createdAt/updatedAt/status/frequency/retryPolicy — so the access window is computed here.

/**
 * Adds one calendar year. Feb 29 has no counterpart in a non-leap year; JS rolls it
 * forward to Mar 1, which is what we want — rolling backwards would shorten a period
 * the customer already paid for.
 */
export function addOneYear(date: Date): Date {
  const next = new Date(date.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

/**
 * The stacking rule. A renewal that arrives before the current period expires must APPEND
 * a year to the remaining time, not restart from now — otherwise every early renewal
 * silently discards the days already paid for.
 *
 * @param latestPeriodEnd the furthest `period_end` across the user's paid rows, or null
 * @param now             injected clock
 */
export function computeNextPeriod(
  latestPeriodEnd: Date | null,
  now: Date,
): { periodStart: Date; periodEnd: Date } {
  const stillRunning = latestPeriodEnd !== null && latestPeriodEnd.getTime() > now.getTime();
  const periodStart = stillRunning ? new Date(latestPeriodEnd.getTime()) : new Date(now.getTime());
  return { periodStart, periodEnd: addOneYear(periodStart) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test billing-period`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/billing-period.ts apps/web/lib/billing-period.test.ts
git commit -m "feat(web): add period stacking so early renewals append rather than reset"
```

---

## Task 4: PaymentEvent union + subscription webhook parsing

**Files:**
- Modify: `apps/web/lib/payments/provider.ts:12-16`
- Modify: `apps/web/lib/payments/abacatepay.ts:40-65`
- Test: `apps/web/lib/payments/abacatepay.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: the `PaymentEvent` discriminated union below, and `parseAbacateEvent(body: unknown): PaymentEvent | null` handling the subscription lifecycle.

```ts
export type PaymentEvent =
  | { type: "paid"; providerChargeId: string; providerSubscriptionId?: string; externalId?: string }
  | { type: "renewed"; providerChargeId: string; providerSubscriptionId: string }
  | { type: "refunded"; providerChargeId: string }
  | { type: "cancelled"; providerSubscriptionId: string; cancelledDueTo?: string }
  | { type: "payment_failed"; providerSubscriptionId: string }
  | { type: "other" };
```

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/lib/payments/abacatepay.test.ts` (keep every existing test in the file):

```ts
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
```

Note: the existing `parseAbacateEvent` tests assert `{ type: "paid", providerChargeId, externalId }` for `checkout.completed`. Those still pass unchanged — a plain `checkout.completed` has no `data.subscription`, so `providerSubscriptionId` is absent. Any existing test asserting `type: "other"` for a *refund* event must be updated to expect `"refunded"`; leave the rest alone.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test abacatepay`
Expected: FAIL — the new describe block fails because `parseAbacateEvent` maps every non-`*.completed` event to `{ type: "other", providerChargeId, externalId }` and never reads `data.subscription`.

- [ ] **Step 3: Widen the PaymentEvent type**

In `apps/web/lib/payments/provider.ts`, replace the `PaymentEvent` interface (lines 12-16) with:

```ts
/**
 * A verified provider callback, narrowed to what the webhook route acts on.
 *
 * `renewed` is separate from `paid` because renewals cannot be resolved to a user the same
 * way: AbacatePay generates the renewal checkout itself and it carries `externalId: null`.
 * The only join key is `providerSubscriptionId`, captured when the subscription was created.
 *
 * `cancelled` deliberately carries no access implication — see computeAccess in lib/access.ts.
 */
export type PaymentEvent =
  | { type: "paid"; providerChargeId: string; providerSubscriptionId?: string; externalId?: string }
  | { type: "renewed"; providerChargeId: string; providerSubscriptionId: string }
  | { type: "refunded"; providerChargeId: string }
  | { type: "cancelled"; providerSubscriptionId: string; cancelledDueTo?: string }
  | { type: "payment_failed"; providerSubscriptionId: string }
  | { type: "other" };
```

Also update the `PRICE_CENTS` comment on line 5 to:

```ts
export const PRICE_CENTS = 11000; // R$110/year ≈ $20/year
```

- [ ] **Step 4: Rewrite parseAbacateEvent**

In `apps/web/lib/payments/abacatepay.ts`, replace the `AbacateChargeLike` type and the whole `parseAbacateEvent` function (lines 40-65) with:

```ts
type AbacateChargeLike = { id?: unknown; externalId?: unknown };
type AbacateSubscriptionLike = { id?: unknown; cancelledDueTo?: unknown };

const REFUND_EVENTS = new Set([
  "checkout.refunded",
  "checkout.disputed",
  "checkout.lost",
  "transparent.refunded",
  "transparent.disputed",
  "transparent.lost",
]);

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Parses AbacatePay's v2 webhook envelope:
 *   { id, event, apiVersion, devMode, data: { checkout | transparent | subscription | ... } }
 *
 * Subscription events nest the charge under `data.checkout` and the subscription under
 * `data.subscription`. Deliberately tolerant of unknown/extra fields — AbacatePay's own docs
 * advise against fully validating the payload shape so future additions don't break this
 * endpoint.
 *
 * Docs: https://docs.abacatepay.com/pages/webhooks/events/subscriptions
 */
export function parseAbacateEvent(body: unknown): PaymentEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as {
    event?: unknown;
    data?: {
      checkout?: AbacateChargeLike;
      transparent?: AbacateChargeLike;
      subscription?: AbacateSubscriptionLike;
    };
  };
  const event = str(b.event);
  if (!event) return null;

  const charge = b.data?.checkout ?? b.data?.transparent;
  const chargeId = str(charge?.id);
  const subscriptionId = str(b.data?.subscription?.id);

  switch (event) {
    case "subscription.completed": {
      // First payment. `externalId` is present here and ONLY here — this is our one chance
      // to record the subscription id against a user.
      if (!chargeId || !subscriptionId) return null;
      return {
        type: "paid",
        providerChargeId: chargeId,
        providerSubscriptionId: subscriptionId,
        externalId: str(charge?.externalId),
      };
    }
    case "subscription.renewed": {
      // The renewal checkout is generated by AbacatePay and carries `externalId: null`.
      // providerSubscriptionId is the only way back to a user; refuse the event without it
      // rather than silently dropping a payment.
      if (!chargeId || !subscriptionId) return null;
      return { type: "renewed", providerChargeId: chargeId, providerSubscriptionId: subscriptionId };
    }
    case "subscription.cancelled": {
      if (!subscriptionId) return null;
      return {
        type: "cancelled",
        providerSubscriptionId: subscriptionId,
        cancelledDueTo: str(b.data?.subscription?.cancelledDueTo),
      };
    }
    case "subscription.payment_failed": {
      if (!subscriptionId) return null;
      return { type: "payment_failed", providerSubscriptionId: subscriptionId };
    }
    case "checkout.completed":
    case "transparent.completed": {
      // A non-subscription one-off charge. Retained so any legacy/manual charge still works.
      if (!chargeId) return null;
      return { type: "paid", providerChargeId: chargeId, externalId: str(charge?.externalId) };
    }
    default: {
      if (REFUND_EVENTS.has(event)) {
        if (!chargeId) return null;
        return { type: "refunded", providerChargeId: chargeId };
      }
      return { type: "other" };
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test abacatepay`
Expected: PASS. If a pre-existing test asserted `type: "other"` for a refund event, update it to `"refunded"` — that is the intended behavior change, not a regression.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL, in `app/api/payments/webhook/route.ts` only — it reads `event.externalId` and `event.providerChargeId` without narrowing, which the union no longer permits. Task 7 fixes that route. Do not patch it here.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/payments/provider.ts apps/web/lib/payments/abacatepay.ts apps/web/lib/payments/abacatepay.test.ts
git commit -m "feat(payments): parse AbacatePay subscription lifecycle events"
```

---

## Task 5: Create subscriptions instead of one-off checkouts

**Files:**
- Modify: `apps/web/lib/payments/abacatepay.ts:84-125` (`createCheckout`)
- Modify: `apps/web/.env.example:14-17`

**Interfaces:**
- Consumes: nothing
- Produces: `createCheckout` unchanged in signature (`{ userId, amountCents, returnUrl, completionUrl } => { url, providerChargeId }`), but now POSTs `/subscriptions/create`.

- [ ] **Step 1: Point createCheckout at the subscription endpoint**

In `apps/web/lib/payments/abacatepay.ts`, replace the body of `createCheckout` (lines 90-125, from the `if (!this.productId)` guard through the `return`) with:

```ts
    if (!this.productId) {
      throw new Error(
        "ABACATEPAY_PRODUCT_ID is not configured. Create the annual-access product once " +
          "(AbacatePay dashboard or POST /v2/products/create with price=11000, currency=BRL, " +
          'cycle="ANNUALLY") and set the returned id as ABACATEPAY_PRODUCT_ID.',
      );
    }
    // POST /subscriptions/create, NOT /checkouts/create. Same parameter shape, but it starts a
    // recurring billing cycle. The referenced product MUST have a `cycle` set — one-off
    // ("avulso") products are rejected by this endpoint.
    // Docs: https://docs.abacatepay.com/pages/subscriptions/reference
    const res = await fetch(`${BASE_URL}/subscriptions/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        // amountCents is not sent directly — AbacatePay charges the referenced product's own
        // fixed price, and the billing cycle comes from the product too. It's kept on the
        // PaymentProvider interface for providers (Stripe, etc.) that do take it directly.
        // A subscription checkout accepts exactly one product.
        items: [{ id: this.productId, quantity: 1 }],
        // Card-only by product decision. To also accept PIX, add "PIX" here — but
        // keep the customer-facing copy in `app/page.tsx` and `components/paywall-cta.tsx`
        // in sync, since it names the accepted method.
        methods: ["CARD"],
        // Our user id. Present on THIS checkout only — the renewal checkouts AbacatePay
        // generates later carry `externalId: null`, which is why the webhook route joins
        // renewals on the subscription id instead.
        externalId: input.userId,
        // After 3 failed attempts 2 days apart, AbacatePay auto-cancels and fires
        // `subscription.cancelled` with cancelledDueTo: "max_payment_retries_exceeded".
        retryPolicy: { maxRetry: 3, retryEvery: 2 },
        returnUrl: input.returnUrl,
        completionUrl: input.completionUrl,
      }),
    });
    const json = (await res.json()) as {
      data?: { url?: string; id?: string };
      error?: unknown;
    };
    if (!res.ok || !json.data?.url || !json.data.id) {
      throw new Error(`abacatepay subscription checkout failed: ${JSON.stringify(json.error ?? json)}`);
    }
    return { url: json.data.url, providerChargeId: json.data.id };
```

- [ ] **Step 2: Update the productId constructor comment**

In the same file, replace the comment on lines 72-75 (above `private productId = ...`) with:

```ts
    // AbacatePay subscriptions reference a pre-created Product by id (POST /v2/products/create
    // or the dashboard) rather than accepting inline product fields. The annual-access product
    // must be created once ahead of launch WITH `cycle: "ANNUALLY"` and price 11000 BRL cents,
    // and its returned `id` set here. A product without a cycle is rejected by
    // /subscriptions/create.
```

- [ ] **Step 3: Update .env.example**

In `apps/web/.env.example`, replace the three comment lines above `ABACATEPAY_PRODUCT_ID=` with:

```
# Create the R$110/year subscription Product in AbacatePay FIRST, then paste its id here.
# It MUST be created with cycle="ANNUALLY" — /subscriptions/create rejects one-off products.
#   POST /v2/products/create {"name":"Next Big Thing — Acesso Anual","price":11000,
#     "currency":"BRL","cycle":"ANNUALLY"}
# createCheckout throws until this is set, so every checkout would 500.
```

Then append to the end of the file:

```
# Register these webhook events in the AbacatePay dashboard, or renewals never arrive:
#   subscription.completed, subscription.renewed, subscription.cancelled,
#   subscription.payment_failed, checkout.refunded, checkout.disputed, checkout.lost
```

- [ ] **Step 4: Run the payment tests**

Run: `pnpm --filter web test abacatepay`
Expected: PASS — `createCheckout` has no test coverage (it does live network I/O), so this confirms nothing regressed in the parsing/verification tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/payments/abacatepay.ts apps/web/.env.example
git commit -m "feat(payments): create AbacatePay subscriptions instead of one-off checkouts"
```

---

## Task 6: Wire access reads and the checkout guard to periods

**Files:**
- Modify: `apps/web/lib/viewer-access.ts`
- Modify: `apps/web/app/api/payments/checkout/route.ts:15-25`

**Interfaces:**
- Consumes: `computeAccess(periodEnd, now)` from Task 2
- Produces: `getViewerAccess(): Promise<{ userId: string | null; hasFullAccess: boolean; periodEnd: Date | null }>`

- [ ] **Step 1: Query the furthest paid period**

Replace the entire contents of `apps/web/lib/viewer-access.ts` with:

```ts
import { headers } from "next/headers";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { computeAccess } from "./access";

// Live session + DB lookup. Requires a `purchases` row with status = "paid" AND a
// period_end still in the future — a "pending" row (checkout started but not completed)
// and a lapsed period both grant nothing.
// Not unit-tested: needs a live session and Postgres, neither of which exists
// in this environment. See access.test.ts for the pure logic this delegates to.
export async function getViewerAccess(): Promise<{
  userId: string | null;
  hasFullAccess: boolean;
  periodEnd: Date | null;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  if (!userId) return { userId: null, hasFullAccess: false, periodEnd: null };
  // Furthest period_end wins: renewals stack, so the newest row is not necessarily the
  // one that expires last. `isNotNull` enforces the "status = 'paid' implies period set"
  // invariant at read time rather than trusting it.
  const rows = await db
    .select({ periodEnd: purchases.periodEnd })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, userId),
        eq(purchases.status, "paid"),
        isNotNull(purchases.periodEnd),
      ),
    )
    .orderBy(desc(purchases.periodEnd))
    .limit(1);
  return { userId, ...computeAccess(rows[0]?.periodEnd ?? null, new Date()) };
}
```

- [ ] **Step 2: Replace the lifetime guard with an active-access guard**

In `apps/web/app/api/payments/checkout/route.ts`, replace lines 15-25 (the `alreadyPaid` block) with:

```ts
  // A second subscription is illegitimate only while access is STILL ACTIVE. Once the period
  // has lapsed the user must be able to subscribe again — the old lifetime guard rejected
  // every charge forever, which would have made re-subscribing impossible.
  const active = await db
    .select({ periodEnd: purchases.periodEnd })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, session.user.id),
        eq(purchases.status, "paid"),
        gt(purchases.periodEnd, new Date()),
      ),
    )
    .limit(1);
  if (active.length > 0) {
    return NextResponse.json({ alreadyActive: true, periodEnd: active[0]!.periodEnd });
  }
```

- [ ] **Step 3: Fix the imports in that route**

In the same file, change the drizzle import on line 3 to:

```ts
import { and, eq, gt } from "drizzle-orm";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: still FAIL in `app/api/payments/webhook/route.ts` only (Task 7 fixes it). No new errors in `viewer-access.ts` or `checkout/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/viewer-access.ts apps/web/app/api/payments/checkout/route.ts
git commit -m "feat(web): gate access on an unexpired period and allow re-subscribing"
```

---

## Task 7: Webhook — handle the subscription lifecycle

**Files:**
- Modify: `apps/web/app/api/payments/webhook/route.ts:30-83`

**Interfaces:**
- Consumes: `PaymentEvent` union (Task 4), `computeNextPeriod` (Task 3), `purchases.providerSubscriptionId/periodStart/periodEnd` (Task 1)
- Produces: nothing consumed downstream

- [ ] **Step 1: Replace the event-handling block**

In `apps/web/app/api/payments/webhook/route.ts`, replace everything from `if (event.type === "paid") {` (line 30) through its closing `}` (line 83) with:

```ts
  const now = new Date();

  // Resolves the access window a new paid row should cover, stacking onto any time the user
  // has already paid for. See lib/billing-period.ts.
  async function nextPeriodFor(userId: string) {
    const rows = await db
      .select({ periodEnd: purchases.periodEnd })
      .from(purchases)
      .where(
        and(
          eq(purchases.userId, userId),
          eq(purchases.status, "paid"),
          isNotNull(purchases.periodEnd),
        ),
      )
      .orderBy(desc(purchases.periodEnd))
      .limit(1);
    return computeNextPeriod(rows[0]?.periodEnd ?? null, now);
  }

  if (event.type === "paid") {
    // Idempotent: a retry of an already-processed event finds no row still `pending` (it's
    // already `paid`), so this UPDATE matches zero rows and does nothing — which also means
    // the period is never extended twice for the same charge.
    const pending = await db
      .select({ id: purchases.id, userId: purchases.userId })
      .from(purchases)
      .where(
        and(eq(purchases.providerChargeId, event.providerChargeId), eq(purchases.status, "pending")),
      )
      .limit(1);

    if (pending.length > 0) {
      const row = pending[0]!;
      const period = await nextPeriodFor(row.userId);
      await db
        .update(purchases)
        .set({
          status: "paid",
          paidAt: now,
          providerSubscriptionId: event.providerSubscriptionId ?? null,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        })
        .where(and(eq(purchases.id, row.id), eq(purchases.status, "pending")));
    } else if (event.externalId) {
      // Fallback: no pending row matched (e.g. the checkout-creation write never landed).
      // Only insert a paid row if none exists yet for this charge — this makes a replayed
      // webhook a no-op instead of creating a duplicate paid purchase.
      const existing = await db
        .select({ id: purchases.id })
        .from(purchases)
        .where(eq(purchases.providerChargeId, event.providerChargeId))
        .limit(1);
      if (existing.length === 0) {
        try {
          const period = await nextPeriodFor(event.externalId);
          // onConflictDoNothing: purchases_provider_charge_uq makes idempotency a database
          // guarantee — a concurrent retry that loses this race is a no-op, not a 500 that
          // makes the provider retry forever. The explicit target keeps that intent legible
          // if another unique constraint is ever added to this table.
          await db
            .insert(purchases)
            .values({
              userId: event.externalId,
              provider: provider.name,
              providerChargeId: event.providerChargeId,
              providerSubscriptionId: event.providerSubscriptionId ?? null,
              amountCents: PRICE_CENTS,
              currency: "BRL",
              status: "paid",
              paidAt: now,
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
            })
            .onConflictDoNothing({ target: purchases.providerChargeId });
        } catch (err) {
          // `externalId` is a FK to user.id. A stale or deleted user makes this throw, and
          // a 500 would make AbacatePay retry the same doomed event indefinitely. The event
          // IS verified at this point — it just can't be resolved to a user — so acknowledge
          // it and surface the problem in logs instead of looping forever.
          // NOTE: a verification failure still returns 400 above; only this
          // post-verification, known-unresolvable insert degrades to a 200.
          console.error(
            `[payments] verified webhook for charge ${event.providerChargeId} could not be ` +
              `resolved to user ${event.externalId}:`,
            err,
          );
        }
      }
    }
  } else if (event.type === "renewed") {
    // Renewal payloads carry `externalId: null` — the ONLY way back to a user is the
    // subscription id we stored when the subscription was created.
    const owner = await db
      .select({ userId: purchases.userId })
      .from(purchases)
      .where(eq(purchases.providerSubscriptionId, event.providerSubscriptionId))
      .limit(1);
    if (owner.length === 0) {
      console.error(
        `[payments] renewal for subscription ${event.providerSubscriptionId} matched no ` +
          `purchase row; access was NOT extended for charge ${event.providerChargeId}`,
      );
    } else {
      const userId = owner[0]!.userId;
      const period = await nextPeriodFor(userId);
      // A new row per renewal. The unique index on provider_charge_id makes a redelivered
      // renewal a no-op, so the period can never be extended twice for one charge.
      await db
        .insert(purchases)
        .values({
          userId,
          provider: provider.name,
          providerChargeId: event.providerChargeId,
          providerSubscriptionId: event.providerSubscriptionId,
          amountCents: PRICE_CENTS,
          currency: "BRL",
          status: "paid",
          paidAt: now,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        })
        .onConflictDoNothing({ target: purchases.providerChargeId });
    }
  } else if (event.type === "refunded") {
    // Refunds and chargebacks are the ONLY thing that revokes access. Flipping status off
    // "paid" drops the row out of the access query, and its period with it.
    await db
      .update(purchases)
      .set({ status: "refunded" })
      .where(eq(purchases.providerChargeId, event.providerChargeId));
  } else if (event.type === "cancelled") {
    // Deliberately no access change: the customer paid through period_end and keeps it.
    // AbacatePay cancellation is immediate and stops future charges, so access lapses on
    // its own when the period runs out.
    console.info(
      `[payments] subscription ${event.providerSubscriptionId} cancelled` +
        (event.cancelledDueTo ? ` (${event.cancelledDueTo})` : "") +
        "; access retained until period_end",
    );
  } else if (event.type === "payment_failed") {
    // No access change while AbacatePay retries. If every retry fails it auto-cancels, and
    // the branch above handles that.
    console.warn(
      `[payments] recurring charge failed for subscription ${event.providerSubscriptionId}`,
    );
  }
```

- [ ] **Step 2: Fix the imports in that route**

In the same file, replace lines 3-6 with:

```ts
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";
import { PRICE_CENTS } from "@/lib/payments/provider";
import { computeNextPeriod } from "@/lib/billing-period";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors anywhere. The `PaymentEvent` union now narrows correctly in every branch.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm --filter web test && pnpm --filter @workspace/db test`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/payments/webhook/route.ts
git commit -m "feat(payments): extend access on renewals and revoke only on refunds"
```

---

## Task 8: Customer-facing copy and the paywall CTA bug

**Files:**
- Modify: `apps/web/components/paywall-cta.tsx`
- Modify: `apps/web/app/page.tsx:15-22`
- Modify: `apps/web/app/account/page.tsx:20-37`
- Modify: `apps/web/app/ideas/[slug]/page.tsx:35-38`

**Interfaces:**
- Consumes: `getViewerAccess()` now returning `periodEnd` (Task 6)
- Produces: nothing

- [ ] **Step 1: Fix the CTA response handling and copy**

Replace the entire contents of `apps/web/components/paywall-cta.tsx` with:

```tsx
"use client";
import { useState } from "react";

export function PaywallCta({ authenticated }: { authenticated: boolean }) {
  const [loading, setLoading] = useState(false);

  async function buy() {
    setLoading(true);
    const res = await fetch("/api/payments/checkout", { method: "POST" });
    if (!res.ok) {
      setLoading(false);
      window.location.href = "/account";
      return;
    }
    // The route answers 200 with `{ alreadyActive: true }` when a subscription is already
    // running. Reading `url` off that shape used to navigate to `undefined`.
    const body = (await res.json()) as { url?: string; alreadyActive?: boolean };
    if (body.url) {
      window.location.href = body.url;
      return;
    }
    setLoading(false);
    window.location.href = "/account";
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-6 text-center">
      <h2 className="text-lg font-semibold">Unlock every idea — R$110/year</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Card payment, renews yearly. Cancel any time.
      </p>
      <button
        onClick={buy}
        disabled={loading}
        className="mt-4 rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {loading ? "Redirecting…" : authenticated ? "Subscribe now" : "Sign in to subscribe"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update the landing page pricing bullets**

In `apps/web/app/page.tsx`, replace the second and third `<li>` (currently lines 16-21, the "Full access is a single R$110 card payment…" and "New ideas are added on a weekly cadence…" items) with:

```tsx
        <li>
          &bull; Full access is R$110/year (about $20) by card &mdash; every idea we&apos;ve
          published, plus everything new for as long as you&apos;re subscribed.
        </li>
        <li>&bull; New ideas are added every month. Cancel any time.</li>
```

Leave the first `<li>` ("5 ideas are free to browse…") and the last one ("Every idea shows its sources…") exactly as they are.

- [ ] **Step 3: Update the account page**

In `apps/web/app/account/page.tsx`, replace the `access.hasFullAccess` branch (lines 20-29) with:

```tsx
      ) : access.hasFullAccess ? (
        <div className="mt-6 rounded-lg border bg-muted/30 p-6">
          <p className="font-medium">Subscription active</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can see every idea. Your access runs through{" "}
            {access.periodEnd?.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
            .
          </p>
          <Link href="/ideas" className="mt-4 inline-block underline">
            Go to the ideas &rarr;
          </Link>
        </div>
```

Leave the signed-out and free-plan branches unchanged.

- [ ] **Step 4: Update the locked-idea message**

In `apps/web/app/ideas/[slug]/page.tsx`, replace the locked paragraph (lines 35-38) with:

```tsx
        <p className="mt-2 text-muted-foreground">
          This idea is locked. Subscribe to see the demand evidence, sources, MRR estimate,
          and validation signals.
        </p>
```

- [ ] **Step 5: Update the two stale test comments**

`apps/web/lib/payments/abacatepay.test.ts` lines 135 and 157 describe the webhook gate as
deciding "whether a callback can grant someone lifetime access". Replace the phrase
`lifetime access` with `a paid access period` in both comments. Change nothing else in
those tests — this is comment accuracy, not behavior.

- [ ] **Step 6: Verify no stale customer-facing copy survives**

Run:

```bash
grep -rniE "lifetime|forever|one[- ]time payment|single R\$110" \
  apps/web/app/page.tsx apps/web/app/account/page.tsx \
  apps/web/app/ideas apps/web/components apps/web/lib/payments/provider.ts
```

Expected: no output. Any hit is copy that still needs updating.

Note the scoping: `app/api/payments/webhook/route.ts` is deliberately excluded because it
contains the words "retry forever" and "looping forever" in comments about provider retry
behavior. Those are correct technical prose, not stale pricing copy — do not "fix" them.

- [ ] **Step 7: Full verification sweep**

Run each and confirm all pass:

```bash
pnpm typecheck
pnpm --filter web test
pnpm --filter @workspace/db test
pnpm --filter web lint
pnpm --filter web build
```

Expected: all PASS. `build` is the one that catches a bad JSX edit in the copy changes.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/paywall-cta.tsx apps/web/app/page.tsx apps/web/app/account/page.tsx "apps/web/app/ideas/[slug]/page.tsx" apps/web/lib/payments/abacatepay.test.ts
git commit -m "feat(web): switch customer-facing copy to the annual subscription"
```

---

---

## Known coverage gap

Neither webhook route nor checkout route has any test, and this plan does not add route-test
infrastructure — that would be a larger piece of work than the feature itself. The three
behaviors that carry real money risk are therefore pushed down into pure, tested functions
(`computeAccess`, `computeNextPeriod`, `parseAbacateEvent`) or into type-level guarantees
(the `PaymentEvent` union, which makes a cancellation-driven revocation unwriteable).

What remains genuinely unverified by the suite: the DB reads and writes in the route
branches themselves — specifically, that a renewal resolves its owner via
`provider_subscription_id` and inserts a stacked row. Manual step 4 below is the only thing
that exercises it. Do not skip it.

## Manual steps before deploy (not code)

These cannot be done from the repo and the feature does not work without them:

1. **Create the product** in AbacatePay with `price: 11000`, `currency: "BRL"`, `cycle: "ANNUALLY"`. Confirm the API accepts `ANNUALLY` — the docs glossary inconsistently says `YEARLY`. Set the returned id as `ABACATEPAY_PRODUCT_ID`.
2. **Add the new webhook events** to the existing webhook registration: `subscription.completed`, `subscription.renewed`, `subscription.cancelled`, `subscription.payment_failed`, `checkout.refunded`, `checkout.disputed`, `checkout.lost`. Without this, renewals are never delivered.
3. **Run the migration** against the deploy database: `pnpm --filter @workspace/db db:migrate`.
4. **Exercise a renewal in dev mode against a `WEEKLY`-cycle test product.** With an annual cycle the first real renewal is a year away, so the renewal path — the most fragile code in this feature — otherwise ships completely unexercised. Confirm that `subscription.renewed` arrives, that its checkout `externalId` really is null, and that a second `purchases` row appears with a stacked period.

---

# Post-review addendum (Tasks 9-10)

Added after the whole-branch review. Both were approved by the product owner.

---

## Task 9: Harden the payment routes (double-subscription guard + failure alerting)

**Files:**
- Modify: `apps/web/app/api/payments/checkout/route.ts`
- Modify: `apps/web/app/api/payments/webhook/route.ts`
- Create: `apps/web/lib/payments/alert.ts`
- Test: `apps/web/lib/payments/alert.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `notifyPaymentFailure(input: { kind: string; detail: string }): Promise<void>`

### Problem 1 — perpetual double-billing

The checkout guard only rejects when a **paid, unexpired** row exists; it ignores `pending`
rows. A user who clicks Subscribe, is redirected to AbacatePay, abandons the page, comes
back and clicks again creates a SECOND AbacatePay subscription. Both auto-renew — R$220/year
in perpetuity. The same path opens if the pending INSERT throws after `createCheckout`
succeeds: the user sees a failure, retries, and is double-subscribed.

### Problem 2 — a year-long silent failure

If `subscription.completed` is never delivered (e.g. the operator registers only
`checkout.completed` in the AbacatePay dashboard — nothing enforces this), the first charge
still grants a year via `checkout.completed`, so launch looks healthy. Twelve months later
every renewal 503s because `provider_subscription_id` is NULL everywhere. The card is
charged, access lapses, and the only evidence is a `console.error`.

- [ ] **Step 1: Write the failing test for the alert helper**

Create `apps/web/lib/payments/alert.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { formatPaymentAlert, shouldSendPaymentAlert } from "./alert";

describe("shouldSendPaymentAlert", () => {
  it("sends when an alert address is configured", () => {
    expect(shouldSendPaymentAlert("ops@example.com")).toBe(true);
  });
  it("does not send when the address is unset", () => {
    expect(shouldSendPaymentAlert(undefined)).toBe(false);
    expect(shouldSendPaymentAlert("")).toBe(false);
  });
});

describe("formatPaymentAlert", () => {
  it("names the failure kind and includes the detail verbatim", () => {
    const out = formatPaymentAlert({ kind: "owner_not_found", detail: "subs_abc123" });
    expect(out.subject).toContain("owner_not_found");
    expect(out.body).toContain("subs_abc123");
  });

  // The whole point of this alert is that the operator can act on it. A body that
  // omits the identifier is unactionable — you cannot repair a row you cannot find.
  it("never produces an empty body", () => {
    const out = formatPaymentAlert({ kind: "row_still_pending", detail: "" });
    expect(out.body.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter web test alert`
Expected: FAIL — "Failed to resolve import ./alert".

- [ ] **Step 3: Implement the alert module**

Create `apps/web/lib/payments/alert.ts`. Keep the pure parts (`shouldSendPaymentAlert`,
`formatPaymentAlert`) free of any `@workspace/db` or `resend` import so they stay testable;
the sending function may import Resend lazily INSIDE the function body — never at module
scope, because `next build` imports this module during page-data collection and a
module-scope `new Resend()` would hard-fail a key-less build (this repo has hit that before).

Read `apps/web/lib/auth.ts` first and follow its existing lazy-Resend pattern exactly.

`notifyPaymentFailure` must never throw: a failing alert must not turn a recoverable webhook
into an unrecoverable one. Wrap the send in try/catch and `console.error` on failure.

Use a new env var `PAYMENT_ALERT_EMAIL`. When unset, `notifyPaymentFailure` is a no-op that
still logs — the webhook must work without it configured.

- [ ] **Step 4: Run the test**

Run: `pnpm --filter web test alert`
Expected: PASS.

- [ ] **Step 5: Wire the alert into the webhook's three 503 paths**

In `apps/web/app/api/payments/webhook/route.ts`, call `await notifyPaymentFailure(...)`
immediately before each of the three 5xx returns, passing a distinct `kind`:
`unresolvable_paid_event`, `owner_not_found`, `row_still_pending`. Include the charge id
and/or subscription id in `detail`.

Do NOT change any status code, any DB write, or the 400 verification path.

- [ ] **Step 6: Add the pending-checkout guard**

In `apps/web/app/api/payments/checkout/route.ts`, after the existing active-access guard,
add a second guard: if the user has a `pending` purchase row created within the last 30
minutes, do NOT create another subscription. Return `{ pendingCheckout: true }` with 200.

Define the window as a named constant, not a magic number.

Rationale to put in a comment: each `createCheckout` call creates a REAL auto-renewing
subscription at AbacatePay. Two of them bill the customer twice a year forever, and nothing
in the app reconciles that.

- [ ] **Step 7: Handle the new response shape in the CTA**

`apps/web/components/paywall-cta.tsx` already treats "200 without a url" as "go to /account".
Verify `{ pendingCheckout: true }` flows through that path and cannot navigate to `undefined`.
Add the field to the response type it parses. Do not otherwise change its behavior.

- [ ] **Step 8: Document the env var**

Add to `apps/web/.env.example`:

```
# Optional but STRONGLY recommended. Where to email when a payment webhook cannot be
# resolved (owner_not_found / unresolvable_paid_event / row_still_pending). Without it
# these failures are only visible in logs, and a lost subscription id is invisible for a
# full year — until renewals start failing.
PAYMENT_ALERT_EMAIL=
```

- [ ] **Step 9: Verify**

```bash
pnpm typecheck
pnpm --filter web test
pnpm --filter @workspace/db test
DATABASE_URL='postgresql://u:p@localhost/db' pnpm --filter web build
```
All must pass.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/payments/alert.ts apps/web/lib/payments/alert.test.ts apps/web/app/api/payments/checkout/route.ts apps/web/app/api/payments/webhook/route.ts apps/web/components/paywall-cta.tsx apps/web/.env.example
git commit -m "feat(payments): guard against double subscriptions and alert on unresolvable webhooks"
```

---

## Task 10: Self-service cancellation

**Files:**
- Modify: `packages/db/src/schema.ts` (add `cancelledAt`, `cancelledDueTo`)
- Create: `packages/db/drizzle/0004_*.sql` (generated)
- Modify: `apps/web/lib/payments/provider.ts` (interface gains `cancelSubscription`)
- Modify: `apps/web/lib/payments/abacatepay.ts` (implement it)
- Create: `apps/web/app/api/payments/cancel/route.ts`
- Create: `apps/web/components/cancel-subscription.tsx`
- Modify: `apps/web/app/account/page.tsx`
- Modify: `apps/web/lib/viewer-access.ts` (expose `cancelledAt`)
- Modify: `apps/web/app/api/payments/webhook/route.ts` (persist cancellation)
- Modify: `apps/web/app/api/payments/checkout/route.ts` (allow resume after cancel)

We advertise "Cancel any time" on the landing page and the paywall. Today nothing cancels,
`/account` keeps rendering "Subscription active" to someone who already cancelled, and
because their period is still unexpired the checkout guard returns `alreadyActive` — so
they cannot resume either. This task makes the advertised promise real.

**Key constraint:** AbacatePay cancellation is IMMEDIATE and IRREVERSIBLE — it stops future
charges but does not refund. The customer keeps access through `period_end`. "Resume"
therefore means starting a NEW subscription, not reviving the old one.

- [ ] **Step 1: Add the schema columns**

In `packages/db/src/schema.ts`, add to `purchases`:

```ts
    // Set when AbacatePay confirms the subscription was cancelled. Access is NOT revoked —
    // the customer keeps what they paid for through period_end. This exists so the account
    // page can say "will not renew" instead of "active", and so the checkout guard knows
    // to let them re-subscribe before their current period ends.
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledDueTo: text("cancelled_due_to"),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @workspace/db db:generate`
Expected: `0004_*.sql` with two nullable ADD COLUMNs. Both MUST be nullable. Verify with
`cat packages/db/drizzle/0004_*.sql`.

- [ ] **Step 3: Extend the PaymentProvider interface**

In `apps/web/lib/payments/provider.ts`:

```ts
  /**
   * Cancels a recurring subscription at the provider. Immediate and irreversible for
   * AbacatePay: future charges stop, nothing is refunded, and the customer keeps access
   * through the period they already paid for. Returns true when the provider confirms.
   */
  cancelSubscription(providerSubscriptionId: string): Promise<boolean>;
```

- [ ] **Step 4: Implement it on AbacatePayProvider**

In `apps/web/lib/payments/abacatepay.ts`, POST to `${BASE_URL}/subscriptions/cancel` with
`{ id: providerSubscriptionId }` and a Bearer token, following the exact shape and error
handling of the existing `createCheckout`. Return `true` only when the response is ok and
the envelope reports success; throw with the provider's error payload otherwise.

- [ ] **Step 5: Persist cancellation from the webhook**

In the webhook's `cancelled` branch — which today only logs — write `cancelledAt` and
`cancelledDueTo` to ALL of that user's rows carrying the subscription id.

This branch MUST still not touch `status`, `period_start`, or `period_end`. Cancelling is
not revoking. Add an assertion-style comment saying so.

Keep it idempotent: a redelivered `cancelled` event must not change anything the second time
(guard on `isNull(purchases.cancelledAt)`).

- [ ] **Step 6: Expose cancellation state to the UI**

In `apps/web/lib/viewer-access.ts`, select `cancelledAt` alongside `periodEnd` on the same
furthest-period row and return it, so `getViewerAccess()` yields
`{ userId, hasFullAccess, periodEnd, cancelledAt }`.

- [ ] **Step 7: Add the cancel API route**

Create `apps/web/app/api/payments/cancel/route.ts`. It must:
- require a session (401 otherwise);
- find the user's furthest-period paid row and read its `providerSubscriptionId`;
- return 400 with a clear message if there is no active subscription or no subscription id;
- call `provider.cancelSubscription(...)`;
- on success return `{ cancelled: true }`. Do NOT write `cancelledAt` here — let the
  `subscription.cancelled` webhook be the single writer, so the DB reflects what the
  provider actually did. Say this in a comment.

- [ ] **Step 8: Allow re-subscribing after cancellation**

In `apps/web/app/api/payments/checkout/route.ts`, the active-access guard must no longer
block a user whose current period is cancelled (`cancelledAt IS NOT NULL`). Without this a
customer who cancels by mistake is locked out of resubscribing until their access lapses.

- [ ] **Step 9: Build the cancel button**

Create `apps/web/components/cancel-subscription.tsx`, a client component that POSTs to
`/api/payments/cancel` and reloads on success. It MUST require an explicit confirmation step
before sending (a two-click in-component confirm — NOT `window.confirm`, which is a blocking
browser dialog). State plainly in the confirm text that cancelling is immediate, that no
refund is issued, and that access continues until the period ends.

Handle the failure case: show an error and re-enable the button. Never leave it stuck.

- [ ] **Step 10: Update the account page**

In `apps/web/app/account/page.tsx`, split the `hasFullAccess` branch in two:
- not cancelled → "Subscription active", renewal date, and `<CancelSubscription />`
- cancelled → "Access ends &lt;date&gt;. Your subscription will not renew." and a
  `<PaywallCta authenticated />` so they can start a new one.

Keep the existing `timeZone: "UTC"` date formatting for every date rendered.

- [ ] **Step 11: Verify**

```bash
pnpm typecheck
pnpm --filter web test
pnpm --filter @workspace/db test
DATABASE_URL='postgresql://u:p@localhost/db' pnpm --filter web build
grep -rniE "lifetime|forever|one[- ]time payment" apps/web/app/page.tsx apps/web/app/account/page.tsx apps/web/app/ideas apps/web/components
```
All must pass; the grep must return nothing.

- [ ] **Step 12: Commit**

```bash
git add packages/db apps/web/lib/payments apps/web/app/api/payments apps/web/components apps/web/app/account
git commit -m "feat(payments): self-service subscription cancellation"
```
