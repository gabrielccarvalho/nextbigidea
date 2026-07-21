import { db, pipelineRuns } from "@workspace/db";
import { eq, gte, sum } from "drizzle-orm";
import { enabledAdapters, loadEnv } from "./config";
import { isOverCap } from "./cap";
import type { RawPost, SourceAdapter } from "./types";
import { hackerNewsAdapter } from "./adapters/hackernews";
import { productHuntAdapter } from "./adapters/producthunt";
import { upsertRawPosts } from "./stages/normalize";
import { dedupeInMemory } from "./stages/dedupe";
import { OpenAiClient } from "./llm";
import { filterRelevant } from "./stages/relevance";
import { clusterPosts } from "./stages/cluster";
import { enrichTheme, persistIdea } from "./stages/enrich";
import { PipelineRunReport } from "./report";

// The concrete adapter list. The `enabled()` gate + config flags decide what runs.
//
// Reddit, X and LinkedIn are deliberately NOT registered here. Reddit's Responsible
// Builder Policy prohibits commercialising their data without written approval, and
// this product sells access to ideas derived from it — the 403s the unauthenticated
// endpoints now return are that policy being enforced, not a technical obstacle to
// route around. X and LinkedIn were only ever reachable by driving a headless browser
// with a logged-in session cookie, which violates both platforms' terms and risks the
// account whose cookie is used. The adapter files remain in-tree for reference; adding
// any of them back to this array requires a signed agreement with that platform.
const ADAPTERS: SourceAdapter[] = [hackerNewsAdapter, productHuntAdapter];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function runPipeline(): Promise<PipelineRunReport> {
  const env = loadEnv();
  const report = new PipelineRunReport();
  const since = new Date(Date.now() - WEEK_MS);
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

    // 4. Cluster into themes.
    const themes = shouldContinue() ? await clusterPosts(relevant, client) : [];

    // 5. Enrich + persist, aborting before the cap is exceeded.
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
