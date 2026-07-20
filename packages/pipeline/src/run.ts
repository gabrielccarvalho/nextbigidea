import { db, pipelineRuns } from "@workspace/db";
import { eq } from "drizzle-orm";
import { enabledAdapters, loadEnv } from "./config";
import type { RawPost, SourceAdapter } from "./types";
import { redditAdapter } from "./adapters/reddit";
import { hackerNewsAdapter } from "./adapters/hackernews";
import { productHuntAdapter } from "./adapters/producthunt";
import { xAdapter } from "./adapters/x";
import { linkedinAdapter } from "./adapters/linkedin";
import { upsertRawPosts } from "./stages/normalize";
import { HaikuClient } from "./anthropic";
import { filterRelevant } from "./stages/relevance";
import { clusterPosts } from "./stages/cluster";
import { enrichTheme, persistIdea } from "./stages/enrich";
import { PipelineRunReport } from "./report";

// The concrete adapter list. Swapping an unofficial adapter for an official one
// = replacing an entry here. The `enabled()` gate + config flags decide what runs.
const ADAPTERS: SourceAdapter[] = [
  redditAdapter,
  hackerNewsAdapter,
  productHuntAdapter,
  xAdapter,
  linkedinAdapter,
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function runPipeline(): Promise<PipelineRunReport> {
  const env = loadEnv();
  const report = new PipelineRunReport();
  const since = new Date(Date.now() - WEEK_MS);

  const [run] = await db.insert(pipelineRuns).values({ status: "running" }).returning({ id: pipelineRuns.id });
  const runId = run!.id;

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

  // 2. Normalize + dedupe + persist raw posts.
  // upsertRawPosts returns a Map keyed by `${source}:${sourcePostId}` — do NOT
  // rebuild this by zipping `collected` against a positional array, since dedupe
  // can drop entries and the indices would misalign.
  const idByKey = await upsertRawPosts(collected, runId);

  // 3. Relevance filter (cost-gated).
  const client = new HaikuClient(env.anthropicApiKey);
  const capMillicents = env.monthlyUsdCap * 100_000;
  let relevant: RawPost[] = [];
  if (client.spentMillicents < capMillicents) {
    relevant = await filterRelevant(collected, client);
  }

  // 4. Cluster into themes.
  const themes = client.spentMillicents < capMillicents ? await clusterPosts(relevant, client) : [];

  // 5. Enrich + persist, aborting before the cap is exceeded.
  for (const theme of themes) {
    if (client.spentMillicents >= capMillicents) break;
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
}
