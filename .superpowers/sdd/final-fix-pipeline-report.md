# Final review fix: pipeline spend cap (Findings 1-3)

Branch: `feat/demand-ideas-platform`

## Finding 1 — "monthly" cap was actually per-run

`packages/pipeline/src/run.ts` now sums `pipelineRuns.estimatedMillicents` for
rows with `startedAt >= now - 30d` **before** inserting the current run's own
row, so the sum naturally excludes the run-in-progress (it has no row yet).
That sum (`alreadySpentMillicents`) is combined with the live
`client.spentMillicents` at every existing checkpoint via a new pure helper:

```ts
// packages/pipeline/src/cap.ts — no @workspace/db import
export function isOverCap(
  alreadySpentMillicents: number,
  runSpentMillicents: number,
  capMillicents: number,
): boolean {
  return alreadySpentMillicents + runSpentMillicents >= capMillicents;
}
```

`run.ts` builds `const shouldContinue = () => !isOverCap(alreadySpentMillicents, client.spentMillicents, capMillicents)` once and reuses it at all three checkpoints (relevance, cluster, enrich loop) plus passes it into `filterRelevant`.

`drizzle-orm`'s `sum()` returns `string | null` (Postgres numeric aggregate),
handled explicitly: `spendRow?.total ? Number(spendRow.total) : 0`. No
try/catch was added around the query — if it throws, `runPipeline` throws
too, which is the intended hard failure (no zero-baseline fail-open).

## Finding 2 — the two largest calls were unbounded and ungated

**(a) `classifyDemand` (relevance.ts) — batched.** `filterRelevant` now
chunks the prefiltered posts into groups of `CLASSIFY_BATCH_SIZE = 100`,
calling `classifyDemand` per chunk and accumulating results. It accepts an
optional `shouldContinue: () => boolean` (default `() => true`), checked
before each batch; when it returns false the loop breaks and the
accumulated partial result is returned (not thrown). `run.ts` passes the cap
closure.

**(b) `clusterPosts` (cluster.ts) — bounded, not batched.** Since clustering
compares posts against each other in one call, batching would fragment
themes. Instead, `clusterPosts` now selects the highest-signal posts first
via a new pure, exported `topByEngagement(posts, limit)` (added to
`stages/themes.ts`, cluster.ts's existing pure-helper sibling module, and
re-exported from `cluster.ts`) and bounds input to
`MAX_CLUSTER_POSTS = 150`. Also raised the `enrich()` call's `max_tokens`
from 2048 to 4096 for this call specifically — `anthropic.ts`'s `enrich()`
now takes an optional `maxTokens = 2048` parameter, so `enrichTheme`'s call
(idea generation, a single JSON object) is untouched at 2048 while
`clusterPosts` passes `4096` explicitly. A comment notes a truncated
response fails `JSON.parse` inside `parseThemes` and is safely dropped to
`[]` by its existing guard — themes are lost, but nothing is corrupted.

## Finding 3 — deduped list computed then discarded

`run.ts` now calls `dedupeInMemory(collected)` once, immediately after the
fetch loop, and uses `deduped` for both `upsertRawPosts` and
`filterRelevant`. `upsertRawPosts`'s internal dedupe is unchanged (still
harmless, still safe for other callers) — its `Map` return contract is
untouched.

## Worked example: PIPELINE_MONTHLY_USD_CAP=5

`capMillicents = 5 * 100_000 = 500,000` millicents ($5.00).

**Before this fix:** each run's `HaikuClient` started at `spentMillicents =
0` and was compared only against `capMillicents`, so every run could spend
up to ~$5 independently. With a weekly cron (~4.33 runs/30 days), the
effective 30-day ceiling was ~$21.65 — over 4x the stated budget.

**After this fix**, all checkpoints compare `alreadySpentMillicents +
client.spentMillicents` against the same `capMillicents`:

- **Single run, first run of a fresh 30-day window** (`alreadySpentMillicents
  = 0`): checkpoints stop issuing new paid calls once cumulative spend would
  reach $5.00. Because the check happens *before* each call/batch (not
  mid-call — you can't abort an in-flight request), the run's actual spend
  can overshoot the $5.00 mark by, at most, the cost of the one call that
  was already permitted to start. That overshoot is now bounded, not
  unbounded, by the same-finding fixes: at most 100 posts in one
  `classifyDemand` batch (max_tokens 1024 out), or one `clusterPosts` call
  over at most 150 posts (max_tokens 4096 out), or one `enrichTheme` call
  over one theme's posts (max_tokens 2048 out). At Haiku 4.5 pricing
  ($1/1M in, $5/1M out) each of these worst-cases is on the order of a few
  cents. So: **max single-run spend ≈ $5.00 + a few cents of bounded
  slop — never the ~$5.00-per-run-regardless-of-history behavior from
  before.**

- **30-day window:** once cumulative spend (prior runs' `estimatedMillicents`
  + the run that tips it over) reaches the cap, every subsequent run in the
  same trailing-30-day window has `alreadySpentMillicents` alone `>=
  capMillicents`, so `shouldContinue()` is false at the very first
  checkpoint — before `filterRelevant` issues even one paid call. **Max
  30-day spend ≈ $5.00 + that same one-call bounded slop (a few cents) —
  not ~$21.65.** The name is now true: it is a monthly cap.

## Existing tests changed

- No existing test's *expectations* changed — `filterRelevant` and
  `clusterPosts`'s existing test coverage (via `parseThemes`/`slugify` in
  `themes.ts`) didn't assert on batch counts, input bounds, or the old
  per-run cap semantics, so nothing needed to be rewritten, only extended.
- `test/relevance.test.ts` and `test/cluster.test.ts` gained new
  `describe` blocks for the new behavior (batching/shouldContinue,
  topByEngagement) plus new imports; no prior `it(...)` blocks were edited.

## TDD evidence for the new pure helpers

- `packages/pipeline/src/cap.ts` (`isOverCap`) — written together with
  `packages/pipeline/test/cap.test.ts` covering: under cap, exactly at cap,
  over cap, zero/zero under a positive cap, prior spend alone exactly at
  cap (must block before any run spend), and prior spend alone over cap.
  Ran in isolation first (`vitest run test/cap.test.ts`) — 6/6 passed
  before being wired into `run.ts`.
- `packages/pipeline/src/stages/themes.ts` (`topByEngagement`) — covered by
  new tests in `test/cluster.test.ts`: descending sort by summed `metrics`
  values, limit respected, empty-`metrics`-object treated as zero, and a
  non-mutation check (`[...posts]` before sort). Ran in isolation
  (`vitest run test/cluster.test.ts`) — 12/12 passed.
- `filterRelevant`'s batching/shouldContinue behavior isn't a pure function
  (it drives `HaikuClient`), so it's covered with a minimal object fake
  (`{ classifyDemand }` cast to `HaikuClient`) rather than a real client:
  batch-size verification (250 posts → batches of 100/100/50), early stop
  via `shouldContinue` returning partial results without throwing, zero
  calls when `shouldContinue` starts false, and zero calls when nothing
  survives the keyword prefilter.

## Verification

```
$ env -u DATABASE_URL pnpm --filter @workspace/pipeline test
 Test Files  11 passed (11)
      Tests  64 passed (64)

$ pnpm --filter @workspace/pipeline typecheck
> tsc --noEmit
(no output — success)
```

Test count went from 50 (baseline) to 64 (+14): 6 in new `cap.test.ts`, 4 new
in `cluster.test.ts` (`topByEngagement`), 4 new in `relevance.test.ts`
(`filterRelevant` batching/gating).

`env -u DATABASE_URL` still succeeds — `cap.ts` has zero imports, and
`topByEngagement` lives in `stages/themes.ts`, which was already free of
`@workspace/db` (cluster.ts, which does import it, is not imported by any
pure test). No module-boundary regression.

## Concerns

- The "single run / single 30-day window" spend ceiling is now `$cap + one
  bounded in-flight call`, not a hard `$cap`. This is inherent to a
  check-before-call design (an in-flight HTTP request to Anthropic can't be
  aborted once sent) and is explicitly what the finding asked for — bounding
  the previously-unbounded overshoot, not eliminating overshoot entirely.
  Worth flagging in case the owner wants a stricter (lower) practical cap to
  build in headroom for this slop, given the stated near-zero budget.
- The 30-day window is measured from `pipelineRuns.startedAt`, not
  `finishedAt`. A run that starts inside the window but is still `status:
  "running"` (e.g., a stuck/crashed run) contributes its current
  `estimatedMillicents` (which is `0` until the final `UPDATE`) to the sum —
  i.e., a genuinely stuck run's spend is invisible to the cap until it
  finishes and writes its final `estimatedMillicents`. This matches the
  finding's described mechanism (`estimatedMillicents` is written at the end
  of each run) and wasn't in scope to change, but is worth knowing.
- `.github/workflows/pipeline.yml` was not touched — the env var was already
  named `PIPELINE_MONTHLY_USD_CAP`, so no rename was needed to make the name
  match the (now-true) behavior.
