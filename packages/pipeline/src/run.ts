import { db, pipelineRuns } from "@workspace/db";
import { eq, gte, sum } from "drizzle-orm";
import { enabledAdapters, loadEnv } from "./config";
import { isOverCap } from "./cap";
import type { RawPost, SourceAdapter } from "./types";
import { hackerNewsAdapter } from "./adapters/hackernews";
import { stackExchangeAdapter } from "./adapters/stackexchange";
import { githubAdapter } from "./adapters/github";
import { upsertRawPosts } from "./stages/normalize";
import { dedupeInMemory } from "./stages/dedupe";
import { OpenAiClient } from "./llm";
import { filterRelevant, keywordPrefilter } from "./stages/relevance";
import { clusterPosts, MAX_CLUSTER_POSTS } from "./stages/cluster";
import { chunkByEngagement } from "./stages/themes";
import { enrichTheme, persistIdea } from "./stages/enrich";
import { PipelineRunReport } from "./report";

// The concrete adapter list. The `enabled()` gate + config flags decide what runs.
//
// Every source here permits commercial third-party use of its public content:
// Hacker News via the open Algolia API, Stack Exchange under CC BY-SA (attribution
// required wherever an excerpt is displayed — author + link are captured per post),
// and GitHub under ToS §D.5/D.8.
//
// Reddit, X, LinkedIn and Product Hunt are deliberately NOT registered. Reddit's
// Responsible Builder Policy and Product Hunt's terms both prohibit commercialising
// their data without written approval, and this product sells access to ideas
// derived from it — the 403s Reddit's unauthenticated endpoints return are that
// policy being enforced, not a technical obstacle to route around. X and LinkedIn
// were only ever reachable by driving a headless browser with a logged-in session
// cookie, which violates both platforms' terms and risks the account whose cookie
// is used. The adapter files remain in-tree for reference; adding any of them back
// to this array requires a signed agreement with that platform. Bluesky is also
// out for now: its post-search endpoint stopped being publicly accessible in 2025
// and now requires an authenticated session.
const ADAPTERS: SourceAdapter[] = [hackerNewsAdapter, stackExchangeAdapter, githubAdapter];

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;

export async function runPipeline(): Promise<PipelineRunReport> {
  const env = loadEnv();
  const report = new PipelineRunReport();
  // 7 days for the weekly cron; PIPELINE_SINCE_DAYS raises it for backfill runs.
  const since = new Date(Date.now() - env.sinceDays * DAY_MS);
  const capMillicents = env.monthlyUsdCap * 100_000;

  // The cap is MONTHLY (trailing 30 days), not per-run. Sum spend already
  // recorded by prior runs in the window BEFORE inserting this run's own row
  // below — that ordering excludes the current run from the sum naturally
  // (it has no row yet), rather than relying on filtering it back out.
  // `sum()` returns a SQL string, and an empty/no-rows window sums to `null`,
  // not `0` — both are handled explicitly.
  // A failure here is a HARD failure: proceeding with a zero baseline would
  // silently fail the cap open, which is worse than having no cap at all.
  const trailingWindowStart = new Date(Date.now() - THIRTY_DAYS_MS);
  const [spendRow] = await db
    .select({ total: sum(pipelineRuns.estimatedMillicents) })
    .from(pipelineRuns)
    .where(gte(pipelineRuns.startedAt, trailingWindowStart));
  const alreadySpentMillicents = spendRow?.total ? Number(spendRow.total) : 0;

  const [run] = await db.insert(pipelineRuns).values({ status: "running" }).returning({ id: pipelineRuns.id });
  const runId = run!.id;

  // Hoisted so the catch below can still record whatever was spent before a crash.
  const client = new OpenAiClient(env.openaiApiKey);

  try {
    // 1. Fetch — each adapter isolated. A failure is recorded and skipped.
    const collected: RawPost[] = [];
    for (const adapter of enabledAdapters(ADAPTERS, env)) {
      try {
        const posts = await adapter.fetchPosts(since, env);
        report.addSource(adapter.name, posts.length);
        collected.push(...posts);
      } catch (err) {
        report.addSource(adapter.name, 0, true, err instanceof Error ? err.message : String(err));
      }
    }

    // Dedupe once, in memory, immediately after fetching — and use this array
    // for everything downstream. Previously `collected` (un-deduped) was passed
    // to filterRelevant even though upsertRawPosts deduped separately for
    // persistence; duplicates were billed to the paid classifier, could survive
    // into the relevant set, and could inflate a theme's askCount by appearing
    // twice. upsertRawPosts still dedupes internally too — harmless, and keeps
    // it safe for any other caller.
    const deduped = dedupeInMemory(collected);

    // 2. Normalize + persist raw posts.
    // upsertRawPosts returns a Map keyed by `${source}:${sourcePostId}` — do NOT
    // rebuild this by zipping `deduped` against a positional array, since its
    // internal dedupe can drop entries and the indices would misalign.
    const idByKey = await upsertRawPosts(deduped, runId);

    // 3. Relevance filter (cost-gated). shouldContinue is re-checked before
    // every classify batch inside filterRelevant so a cap tripped mid-way
    // stops issuing further paid calls.
    const shouldContinue = () =>
      !isOverCap(alreadySpentMillicents, client.spentMillicents, capMillicents);
    let relevant: RawPost[] = [];
    if (shouldContinue()) {
      relevant = await filterRelevant(deduped, client, shouldContinue);
    }
    // Recomputing the prefilter for the count is negligible next to one fetch;
    // it keeps filterRelevant's signature untouched.
    report.prefiltered = keywordPrefilter(deduped).length;
    report.relevant = relevant.length;

    // 4+5. Cluster into themes, then enrich + persist — chunk by chunk, aborting
    // before the cap is exceeded. A weekly run rarely exceeds one chunk, so this
    // is the old single-call behaviour; a backfill run walks every chunk instead
    // of silently dropping everything beyond the first MAX_CLUSTER_POSTS posts.
    // Ordering matters: each chunk is persisted before the next one clusters, so
    // findSimilarIdea folds a later chunk's near-duplicate themes into the ideas
    // an earlier chunk just created rather than minting parallel copies.
    for (const chunk of chunkByEngagement(relevant, MAX_CLUSTER_POSTS)) {
      if (!shouldContinue()) break;
      const themes = await clusterPosts(chunk, client);
      report.themes += themes.length;
      for (const theme of themes) {
        if (!shouldContinue()) break;
        const idea = await enrichTheme(theme.themeTitle, theme.posts, client);
        if (!idea) continue;
        const ids = theme.posts
          .map((p) => idByKey.get(`${p.source}:${p.sourcePostId}`))
          .filter((x): x is number => typeof x === "number");
        const outcome = await persistIdea(idea, theme.posts, ids, theme.matchedIdeaId);
        if (outcome === "created") report.ideasCreated++;
        else report.ideasUpdated++;
      }
    }

    report.spentMillicents = client.spentMillicents;
    await db
      .update(pipelineRuns)
      .set({
        status: report.status,
        finishedAt: new Date(),
        stats: report.toStats(),
        estimatedMillicents: report.spentMillicents,
      })
      .where(eq(pipelineRuns.id, runId));

    return report;
  } catch (err) {
    // The adapter loop is individually isolated, but the stages after it (and the
    // DB itself) can still throw. Without this, the row stays "running" forever and
    // a crashed run is indistinguishable from one still in progress — and, worse,
    // its spend would never be recorded, so the trailing-30-day cap sum would
    // under-count and let later runs overspend.
    report.spentMillicents = client.spentMillicents;
    await db
      .update(pipelineRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        stats: report.toStats(),
        estimatedMillicents: report.spentMillicents,
      })
      .where(eq(pipelineRuns.id, runId));
    // Rethrow: cli.ts must still exit non-zero so the workflow opens an issue.
    throw err;
  }
}
