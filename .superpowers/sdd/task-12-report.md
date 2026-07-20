# Task 12 Report: Better Auth (Google + magic link) + Resend

## What was implemented

- `apps/web/lib/auth.ts` — `betterAuth()` instance: Drizzle adapter (`provider: "pg"`) over `@workspace/db`'s `db`/`schema`, Google social provider, `magicLink` plugin sending via Resend. Matches the brief's Step 3 code exactly (no functional changes needed — see divergence notes below for what *did* need adjusting outside this file).
- `apps/web/lib/auth-client.ts` — `createAuthClient` from `better-auth/react` + `magicLinkClient`, exporting `authClient`, `signIn`, `signOut`, `useSession`. Matches the brief's Step 4 exactly.
- `apps/web/app/api/auth/[...all]/route.ts` — `export const { GET, POST } = toNextJsHandler(auth)`. Matches the brief's Step 5 exactly; confirmed correct for this Next.js version (see docs findings below).
- `apps/web/.env.example` — placeholder-only, matches the brief's Step 6 exactly. Committed with `git add -f` since `.env*` is gitignored (precedent: `packages/db/.env.example`).
- `packages/db/src/schema.ts` — added three indexes to the auth tables (see reconciliation below). No column changes were needed.
- `packages/db/drizzle/0001_aspiring_bloodaxe.sql` + updated `meta/` — regenerated migration, additive-only (3 `CREATE INDEX` statements).
- `apps/web/package.json` — added `zod: "^4.3.6"` as a direct dependency (not in the brief; required to fix a real TypeScript error — see below).

## Schema reconciliation (Step 2) — ran successfully

The generator ran against the network with no issues:
```
cd apps/web && DATABASE_URL=<placeholder> BETTER_AUTH_SECRET=<placeholder> RESEND_API_KEY=<placeholder> \
  GOOGLE_CLIENT_ID=dummy GOOGLE_CLIENT_SECRET=dummy \
  npx @better-auth/cli@latest generate --config lib/auth.ts --output <tmpfile> -y
```
This installed `@better-auth/cli@1.4.21` via npx and produced output for `user`, `session`, `account`, `verification` (91 lines, reproduced in full during the session).

**Column-by-column comparison against the existing `packages/db/src/schema.ts`:** every column name, type, nullability, and default in all four tables already matched the generator's output exactly. No columns were missing or extra. This confirms Task 1's author read the Better Auth docs correctly for column shape.

**What the generator added that the existing schema lacked (all additive, non-breaking):**
- `index("session_user_id_idx").on(session.userId)`
- `index("account_user_id_idx").on(account.userId)`
- `index("verification_identifier_idx").on(verification.identifier)`

I added these three indexes and regenerated the migration (`pnpm --filter @workspace/db db:generate`), which produced a clean 3-statement `CREATE INDEX` migration with no other diffs — confirming no other drift existed anywhere in the schema.

**What the generator added that I deliberately did NOT adopt:** `.$onUpdate(() => new Date())` on the `updatedAt` columns of `session`, `account`, and `verification` (and dropped `.defaultNow()` from `session.updatedAt`). I traced this into `better-auth/dist/db/internal-adapter.mjs`, which explicitly sets `updatedAt: new Date()` on every create/update call Better Auth itself performs — the library never relies on DB-level defaults or triggers for this column. The `$onUpdate` hook is therefore redundant for Better Auth's own operations and only matters if something else writes to these tables via raw Drizzle without going through Better Auth. Since it's a behavioral modifier rather than a column, and the existing tables (`ideas`, `rawPosts`, etc.) don't use `$onUpdate` anywhere in this codebase, I left the existing `createdAt`/`updatedAt: timestamp(...).notNull().defaultNow()` pattern untouched for consistency. This is a judgment call, not a correctness gap — flagging it explicitly per the task's instructions.

I also checked whether the drizzle adapter needs Drizzle relations (`relations(user, ...)` etc., which the generator emits but which don't exist in the current schema exports) — it only uses `db.query[...].findFirst/findMany` with `with: includes` when `options.experimental.joins` is enabled in the `betterAuth()` config (confirmed by reading `@better-auth/drizzle-adapter`'s `dist/index.mjs`). We do not set `experimental.joins`, so the adapter falls back to plain `db.select().from(...).where(...)` and relations are not required. No relations were added.

## Better Auth API — no divergences from the brief

Installed version is `better-auth@1.6.23` (the brief's `package.json` range is `^1.2.0`, which permits this). I verified every import path and function signature the brief uses against the installed package's `.d.mts` files before writing code:
- `better-auth/adapters/drizzle` → `drizzleAdapter(db, { provider: "pg" | "mysql" | "sqlite", schema, ... })` — matches.
- `better-auth/plugins` → exports `magicLink({ sendMagicLink: ({ email, url, token, metadata? }, ctx?) => Awaitable<void>, ... })` — the brief's `{ email, url }` destructure is a valid subset — matches.
- `better-auth/next-js` → `toNextJsHandler(auth)` returns `{ GET, POST, PATCH, PUT, DELETE }` (all bound to `(request: Request) => Promise<Response>`); the brief only destructures `GET, POST`, which is a valid subset — matches. (Note: this module also exports a `nextCookies()` plugin, Better Auth's official recommendation for Server Actions to correctly propagate `Set-Cookie` headers. It is irrelevant to a route-handler-only setup like this task's, but later tasks that call `authClient` from Server Actions/Components should be aware it exists and may need to add it to the `plugins` array.)
- `better-auth/react` → `createAuthClient(options?)` returns a client with `useSession()`, matches.
- `better-auth/client/plugins` → exports `magicLinkClient` — matches.

No plugin import paths, adapter signatures, handler export shapes, or magic-link callback signatures diverged from the brief. The one real divergence found was environmental/toolchain, not Better Auth's API surface (see next section).

## Real divergence found: TypeScript portability error (TS2742) — required adding `zod` as a direct dependency

`pnpm --filter web typecheck` initially failed with:
```
lib/auth-client.ts(4,14): error TS2742: The inferred type of 'authClient' cannot be named without a reference to '.pnpm/zod@4.4.3/node_modules/zod/v4/core'. This is likely not portable.
lib/auth.ts(9,14): error TS2742: The inferred type of 'auth' cannot be named without a reference to '.pnpm/zod@4.4.3/node_modules/zod/v4/core'.
```
Cause: Better Auth's public types are built on Zod schemas internally, but under pnpm's strict (non-hoisted) `node_modules` layout, `zod` was only reachable transitively through `better-auth`'s own `node_modules`, not from `apps/web`. TypeScript can't emit a portable type reference to a module the consuming package can't resolve. This is not a bug in the brief's code — it's a structural consequence of pnpm strict mode plus Better Auth's Zod-based type inference, and it will hit any pnpm-strict consumer of `better-auth@1.6.x`.

Fix: added `"zod": "^4.3.6"` (matching `better-auth`'s own dependency range) to `apps/web/package.json` as a direct dependency, then `pnpm install`. This resolved to the already-present `zod@4.4.3` in the lockfile (3-line lockfile diff, no new package downloaded) and fixed both TS2742 errors with no other code changes. Not called for in the brief; documented here per the task's divergence-reporting instructions.

## Next.js route-handler docs (`node_modules/next/dist/docs/`)

Read `01-app/01-getting-started/15-route-handlers.md` and `01-app/03-api-reference/03-file-conventions/route.md` (Next.js 16.2.6, this repo's modified build) before writing anything under `apps/web`.

Findings relevant to this task and later web tasks:
- The `export const { GET, POST } = ...` destructuring shape used by `toNextJsHandler` is unremarkable to Next.js — route handlers are just named exports of functions matching `(request, context?) => Response | Promise<Response>` per HTTP method; how those functions are produced (directly written vs. destructured from a library's return value) is irrelevant to the framework. Confirmed correct for this version.
- `[...all]` catch-all dynamic segment naming follows the documented `app/blog/[...slug]/route.js` convention — any name works, `all` is fine.
- **`context.params` is a Promise** (has been since v15.0.0-RC) — not directly relevant to this task since `toNextJsHandler` doesn't expose a `context` param to us, but load-bearing for any *other* dynamic route handler later tasks write by hand.
- Route Handlers are **not cached by default**; only `GET` can opt into caching via `export const dynamic = 'force-static'`. Our auth route does no such thing and is correctly left dynamic (confirmed in the build output: `ƒ /api/auth/[...all]` = server-rendered on demand).
- No deviation from stock Next.js route-handler behavior was found in this modified build, beyond what a previous task already confirmed for `transpilePackages`.

## Build-time env var requirement (new finding, relevant to CI/deploy setup)

`pnpm --filter web build` uses Turbopack's "Collecting page data" step, which **eagerly evaluates** the `/api/auth/[...all]` route module (and therefore `lib/auth.ts`) at build time, not just at request time. This means the build will hard-fail (not just warn) unless these are set in the build environment:
- `DATABASE_URL` — `packages/db/src/client.ts` throws synchronously if unset.
- `RESEND_API_KEY` — the `resend` package's `Resend` constructor throws synchronously if unset (`"Missing API key"`).

By contrast, `BETTER_AUTH_SECRET` unset only logs a `[BetterAuthError]`-formatted warning (non-fatal — build still succeeds), and missing `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` only logs a `WARN` (`Social provider google is missing clientId or clientSecret`) — build still succeeds. I did not change any code to work around this (the brief's top-level `new Resend(...)` is intentional fail-fast behavior); it must be handled by ensuring real (or CI-placeholder) values for `DATABASE_URL` and `RESEND_API_KEY` are present wherever `next build` runs. This is worth surfacing to whoever sets up CI/deploy for later tasks.

## Verification command output

**`pnpm --filter @workspace/db typecheck`** — pass, no output (clean `tsc --noEmit`).

**`pnpm --filter web typecheck`** — pass, no output, after the `zod` dependency fix above.

**`pnpm --filter web build`** — pass (exit 0), using placeholder env vars for the reasons above:
```
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
RESEND_API_KEY="re_placeholder_for_build_verification" \
BETTER_AUTH_SECRET="placeholder-build-secret-not-real" \
pnpm build
```
Output:
```
✓ Compiled successfully in 1505ms
Running TypeScript ... Finished TypeScript in 1094ms
Collecting page data using 6 workers ...
WARN [better-auth] Base URL is not set...
WARN [better-auth] Social provider google is missing clientId or clientSecret
✓ Generating static pages using 6 workers (4/4)

Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/auth/[...all]
```
None of these placeholder values were committed anywhere; `.next/` (gitignored) was deleted after the run.

**`env -u DATABASE_URL pnpm --filter @workspace/db test`** — pass: `5 tests passed (5)`.

**`pnpm --filter @workspace/pipeline test`** — pass: `50 tests passed (50)` across 10 files. (`packages/pipeline` was not touched.)

## Files changed

- `apps/web/lib/auth.ts` (new)
- `apps/web/lib/auth-client.ts` (new)
- `apps/web/app/api/auth/[...all]/route.ts` (new)
- `apps/web/.env.example` (new, force-added)
- `apps/web/package.json` (added `zod` dependency)
- `packages/db/src/schema.ts` (added 3 indexes to `session`, `account`, `verification`; no column changes; `ideas`/`rawPosts`/`ideaEvidence`/`purchases`/`pipelineRuns` untouched)
- `packages/db/drizzle/0001_aspiring_bloodaxe.sql` (new migration, additive-only)
- `packages/db/drizzle/meta/0001_snapshot.json`, `meta/_journal.json` (regenerated)
- `pnpm-lock.yaml` (3-line diff: `zod` added to `apps/web`'s resolved dependencies)

Commit: `f164b43` — "feat(web): add Better Auth with Google OAuth and Resend magic links"

## Self-review findings

- Re-read every new/changed file after writing. `auth.ts`, `auth-client.ts`, and the route handler are byte-for-byte what the brief specified (Steps 3–5), since verification confirmed the brief's code was correct for the installed library version — no bending required.
- Confirmed `packages/pipeline` was not touched (`git status` / commit stat show zero pipeline files).
- Confirmed no non-auth table in `schema.ts` changed (`ideas`, `rawPosts`, `ideaEvidence`, `purchases`, `pipelineRuns` diff-free).
- Confirmed no real secrets anywhere: grepped the staged `.env.example` diff — all values are placeholders or empty; the dummy values used for the CLI generator run and build verification were only ever passed as inline shell env vars, never written to a file or committed.
- Confirmed `.next/` build output was deleted and never staged.
- One open judgment call flagged above (not adopting `$onUpdate`) — low risk, reasoned, documented; a reviewer could reasonably choose the opposite and it would still be correct.

## Issues or concerns

- None blocking. The `DATABASE_URL`/`RESEND_API_KEY`-required-at-build-time behavior (see above) isn't a bug but is a real operational constraint whoever configures CI/deployment for this app needs to know.
- The `nextCookies()` plugin from `better-auth/next-js` was not added since it's not needed for a route-handler-only setup, but later tasks that call `authClient`/`auth.api` from Server Actions or Server Components should check whether they need it for correct cookie propagation.

## Fix pass

Applied review finding: moved Resend client construction from module scope into the `sendMagicLink` callback.

**Problem:** The installed `resend@4.8.0` constructor throws synchronously when `RESEND_API_KEY` is absent. At module scope, this throw fires during `next build`'s page-data collection step (which eagerly evaluates the `/api/auth/[...all]` route module), causing the entire app build to fail on any deploy that hasn't configured the mail key yet — even though the Resend client is only needed when magic links are actually sent, never during builds.

**Fix:** Deleted the module-scope line:
```ts
const resend = new Resend(process.env.RESEND_API_KEY);
```

Moved client construction into `sendMagicLink` callback as its first statement, with explanatory comment:
```ts
sendMagicLink: async ({ email, url }) => {
  // Constructed lazily, NOT at module scope. `new Resend()` throws
  // synchronously when RESEND_API_KEY is unset, and at module scope that
  // throw fires during `next build`'s page-data collection — failing the
  // ENTIRE app build, not just auth, on any deploy that hasn't set the
  // key yet. Inside the callback it can only fail when a mail is sent.
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
```

Rest of callback body (`from`/`to`/`subject`/`text` fields, `url` interpolation) unchanged. All other parts of `betterAuth({...})` config untouched (Drizzle adapter, Google provider, `baseURL`, `secret`).

**Verification — build without RESEND_API_KEY:**
```bash
env -u RESEND_API_KEY DATABASE_URL='postgresql://user:pass@localhost:5432/db' pnpm --filter web build
```

Output (truncated, key lines):
```
✓ Compiled successfully in 1750ms
  Running TypeScript ... Finished TypeScript in 1348ms ...
[33mWARN[0m [1m[Better Auth]:[0m [better-auth] Base URL is not set...
[Error [BetterAuthError]: You are using the default secret...
✓ Generating static pages using 6 workers (4/4) in 147ms

Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/auth/[...all]
```

**Build succeeded (exit 0).** Critically: no `"Missing API key"` error from Resend. The warnings about `BETTER_AUTH_URL` and default secret are pre-existing and non-fatal (as documented in the original report). The build completing with `Resend` throwing only at runtime (during an actual mail send) proves the module-scope coupling is broken.

**Typecheck:**
```bash
pnpm --filter web typecheck
```

Passed with no errors (clean `tsc --noEmit`).

**Commit:**
```
a376af6 fix: move Resend client construction inside sendMagicLink callback
```

**Hazard resolved:** The app build no longer requires `RESEND_API_KEY` to be set. Deployments that haven't configured mail yet will no longer fail the entire build with a cryptic Resend error — the error (if any) will only surface when a user actually requests a magic link, making the failure clear and contained. CI/deployment can now provision `DATABASE_URL` for the inherent DB check, but safely omit `RESEND_API_KEY` during initial bootstraps.
