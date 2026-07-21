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
  `BETTER_AUTH_SECRET`, and the four `ABACATEPAY_*` values. `global-setup.ts` fails fast and
  names the missing variable.

## What is real, and what is not

Real: the session (a genuine `session` row + a correctly signed Better Auth cookie), the
`POST /v2/subscriptions/create` call to **AbacatePay's live dev API**, the pending/paid rows,
the HMAC-verified webhook, and the rendered access state.

Simulated: the Google OAuth handshake (Google blocks automated browsers) and typing a card into
AbacatePay's hosted page (theirs, no test-card flow). The webhook is delivered for the **real**
charge id the API just returned.

Checkout is intentionally **not** mocked. A version of this suite that POSTed straight to the
webhook is why a `ABACATEPAY_PRODUCT_ID` pointing at a product with no billing `cycle` reached
production with a green build.

## Side effects

Each run creates a real dev-mode subscription record in the AbacatePay dashboard. No money moves
(`abc_dev_…` key), but they accumulate. The test user is regenerated every run because AbacatePay
deduplicates subscription creation on `externalId` and skips product validation on a repeat —
a fixed user would make the suite pass off their cache regardless of configuration.

Database rows are namespaced `e2e_` / `e2e-` and deleted both before seeding and in teardown.
