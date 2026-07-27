# E2E suite — login → purchase

```bash
docker compose up -d          # from the repo root: Postgres + the two Neon proxies
pnpm --filter web test:e2e
```

Runs its own `next dev` on **:3100** and deliberately never adopts an already-running server: a
stray server carries its own environment, and env drift is exactly what this suite exists to catch.

It can run **while `pnpm dev` is up** on :3000, but that takes more than a distinct port. Next 16
allows only one `next dev` per *build directory* and rejects a second with "Another next dev
server is already running" whatever port it was given, so the suite sets `NEXT_DIST_DIR=.next-e2e`
(see `distDir` in `next.config.ts`) to give its server its own lock.

## Prerequisites

- The docker stack from `docker-compose.yml` is up.
- `apps/web/.env` is populated — in particular `DATABASE_URL`, `NEON_LOCAL_PROXY=true`,
  `BETTER_AUTH_SECRET`, and the three `STRIPE_*` values. `global-setup.ts` fails fast and
  names the missing variable.
- Those Stripe credentials must be **test mode** (`sk_test_…` / `rk_test_…`). The suite creates
  real Checkout Sessions; a live key would put them on your live account.

## What is real, and what is not

Real: the session (a genuine `session` row + a correctly signed Better Auth cookie), the
`POST /v1/checkout/sessions` call to **Stripe's test-mode API**, the pending/paid/refunded rows,
the signature-verified webhooks, and the rendered access state.

Simulated: the Google OAuth handshake (Google blocks automated browsers) and typing a card into
Stripe's hosted page (theirs). Webhooks are delivered for the **real** session id the API just
returned, signed with the SDK's own `generateTestHeaderStringAsync` — not a hand-rolled HMAC,
which would be a second implementation of the thing under test and free to drift from it.

Checkout is intentionally **not** mocked. A version of this suite that POSTed straight to the
webhook is why a misconfigured product id reached production with a green build. The real call
also exercises `assertPriceMatches()`, so a Price edited in the Stripe dashboard to something
other than `PRICE_CENTS` fails here rather than in production.

## What the purchase spec covers

Locked → real checkout → paid → unlocked → **partial** refund (access survives) → **full**
refund (access revoked). Plus a forged, unsigned webhook, which must be rejected `400` and write
nothing.

## Side effects

Each run creates a real test-mode Checkout Session in the Stripe dashboard. No money moves, but
they accumulate. The test user is regenerated every run because a paid row grants access
permanently — a fixed user would arrive at its second run already owning access, and checkout
would short-circuit to `{ alreadyActive: true }` before reaching Stripe at all.

Database rows are namespaced `e2e_` / `e2e-` and deleted both before seeding and in teardown.
