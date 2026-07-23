import { db, ideas } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { RawPost } from "../types";
import type { LlmClient } from "../llm";
import { parseThemes, topByEngagement } from "./themes";

export { slugify, parseThemes, topByEngagement } from "./themes";

// Clustering groups posts into themes by comparing them against one another
// in a single call, so — unlike filterRelevant's per-post classification —
// splitting the input into batches would fragment themes across calls and
// create near-duplicate ideas. Instead we bound the INPUT to the highest-
// engagement posts rather than batching the calls.
// Exported so run.ts chunks the relevant set at exactly this boundary — every
// chunk it passes fits one clusterPosts call with nothing silently dropped.
export const MAX_CLUSTER_POSTS = 150;

// Enforced by Structured Outputs, which is why the prompt no longer has to beg for
// "ONLY a JSON array". `strict` mode requires additionalProperties: false and every
// property listed in `required`.
const THEMES_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      postKeys: { type: "array", items: { type: "string" } },
    },
    required: ["title", "postKeys"],
    additionalProperties: false,
  },
} as const satisfies Record<string, unknown>;

async function findSimilarIdea(themeTitle: string): Promise<number | null> {
  // pg_trgm similarity on the keywords column; threshold 0.3.
  const rows = await db
    .select({ id: ideas.id })
    .from(ideas)
    .where(sql`similarity(${ideas.keywords}, ${themeTitle}) > 0.3`)
    .orderBy(sql`similarity(${ideas.keywords}, ${themeTitle}) DESC`)
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function clusterPosts(
  posts: RawPost[],
  client: LlmClient,
): Promise<{ themeTitle: string; posts: RawPost[]; matchedIdeaId: number | null }[]> {
  if (posts.length === 0) return [];
  const bounded = topByEngagement(posts, MAX_CLUSTER_POSTS);
  const byKey = new Map(bounded.map((p) => [`${p.source}:${p.sourcePostId}`, p]));
  const listing = bounded
    .map((p) => `${p.source}:${p.sourcePostId} => ${(p.title ?? p.content).slice(0, 200)}`)
    .join("\n");
  // "Be exhaustive" and "single-post theme is normal" are load-bearing: without
  // them the model volunteers only a handful of tidy multi-post groups and
  // silently discards the rest. The 180-day backfill produced 6 ideas from
  // ~1,000 classified-relevant posts for exactly this reason — the funnel died
  // here, not at fetch or classification.
  const prompt =
    `Group these posts into distinct product-demand themes. Each theme is one buildable SaaS idea.\n` +
    `Be exhaustive: every post expressing a concrete buildable product need must appear in exactly one theme, ` +
    `and a single-post theme is normal — never drop a post because nothing else resembles it. ` +
    `Omit only posts that express no product need at all.\n` +
    `Each theme has a short title and the keys of the posts belonging to it.\n\n` +
    listing;
  // Grouping is mechanical comparison, not authored prose, so it runs on the bulk tier.
  //
  // maxTokens 8192: exhaustive clustering of a full 150-post chunk can emit a hundred-odd
  // themes, and a response cut off mid-JSON still fails to parse and is safely dropped to
  // `[]` by parseThemes' existing guard — themes are lost, but nothing is ever corrupted.
  // Silent loss of a whole chunk is exactly what the funnel stats exist to surface.
  const themes = parseThemes(
    await client.complete(prompt, { maxTokens: 8192, tier: "bulk", schema: THEMES_SCHEMA }),
  );
  const result: { themeTitle: string; posts: RawPost[]; matchedIdeaId: number | null }[] = [];
  for (const t of themes) {
    const themePosts = t.postKeys.map((k) => byKey.get(k)).filter((p): p is RawPost => !!p);
    if (themePosts.length === 0) continue;
    result.push({ themeTitle: t.title, posts: themePosts, matchedIdeaId: await findSimilarIdea(t.title) });
  }
  return result;
}
