import { db, ideas } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { RawPost } from "../types";
import type { HaikuClient } from "../anthropic";
import { parseThemes } from "./themes";

export { slugify, parseThemes } from "./themes";

async function findSimilarIdea(themeTitle: string): Promise<number | null> {
  // pg_trgm similarity on the keywords column; threshold 0.3.
  const rows = await db
    .select({ id: ideas.id, sim: sql<number>`similarity(${ideas.keywords}, ${themeTitle})` })
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
  const byKey = new Map(posts.map((p) => [`${p.source}:${p.sourcePostId}`, p]));
  const listing = posts
    .map((p) => `${p.source}:${p.sourcePostId} => ${(p.title ?? p.content).slice(0, 200)}`)
    .join("\n");
  const prompt =
    `Group these posts into distinct product-demand themes. Each theme is one buildable SaaS idea.\n` +
    `Return ONLY a JSON array: [{"title": "<short theme title>", "postKeys": ["source:id", ...]}].\n\n` +
    listing;
  const themes = parseThemes(await client.enrich(prompt));
  const result: { themeTitle: string; posts: RawPost[]; matchedIdeaId: number | null }[] = [];
  for (const t of themes) {
    const themePosts = t.postKeys.map((k) => byKey.get(k)).filter((p): p is RawPost => !!p);
    if (themePosts.length === 0) continue;
    result.push({ themeTitle: t.title, posts: themePosts, matchedIdeaId: await findSimilarIdea(t.title) });
  }
  return result;
}
