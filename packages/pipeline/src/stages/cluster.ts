import { db, ideas } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { RawPost } from "../types";
import type { HaikuClient } from "../anthropic";
import { parseThemes, topByEngagement } from "./themes";

export { slugify, parseThemes, topByEngagement } from "./themes";

// Clustering groups posts into themes by comparing them against one another
// in a single call, so — unlike filterRelevant's per-post classification —
// splitting the input into batches would fragment themes across calls and
// create near-duplicate ideas. Instead we bound the INPUT to the highest-
// engagement posts rather than batching the calls.
const MAX_CLUSTER_POSTS = 150;

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
  client: HaikuClient,
): Promise<{ themeTitle: string; posts: RawPost[]; matchedIdeaId: number | null }[]> {
  if (posts.length === 0) return [];
  const bounded = topByEngagement(posts, MAX_CLUSTER_POSTS);
  const byKey = new Map(bounded.map((p) => [`${p.source}:${p.sourcePostId}`, p]));
  const listing = bounded
    .map((p) => `${p.source}:${p.sourcePostId} => ${(p.title ?? p.content).slice(0, 200)}`)
    .join("\n");
  const prompt =
    `Group these posts into distinct product-demand themes. Each theme is one buildable SaaS idea.\n` +
    `Return ONLY a JSON array: [{"title": "<short theme title>", "postKeys": ["source:id", ...]}].\n\n` +
    listing;
  // max_tokens raised to 4096 (from the enrich() default of 2048): a large
  // theme listing can otherwise get cut off mid-JSON. A truncated response
  // fails JSON.parse inside parseThemes and is safely dropped to `[]` by its
  // existing guard — themes are lost, but nothing is ever corrupted.
  const themes = parseThemes(await client.enrich(prompt, 4096));
  const result: { themeTitle: string; posts: RawPost[]; matchedIdeaId: number | null }[] = [];
  for (const t of themes) {
    const themePosts = t.postKeys.map((k) => byKey.get(k)).filter((p): p is RawPost => !!p);
    if (themePosts.length === 0) continue;
    result.push({ themeTitle: t.title, posts: themePosts, matchedIdeaId: await findSimilarIdea(t.title) });
  }
  return result;
}
