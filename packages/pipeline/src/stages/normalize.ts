import { db, rawPosts, type NewRawPost } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import type { RawPost } from "../types";
import { dedupeInMemory } from "./dedupe";

// Upsert each post and return a map from `${source}:${sourcePostId}` -> DB row id.
// Keyed rather than positional on purpose: dedupeInMemory can drop entries, so a
// positional array would silently misalign with the caller's input list.
export async function upsertRawPosts(
  posts: RawPost[],
  runId: number,
): Promise<Map<string, number>> {
  const deduped = dedupeInMemory(posts);
  if (deduped.length === 0) return new Map();
  const rows: NewRawPost[] = deduped.map((p) => ({
    source: p.source,
    sourcePostId: p.sourcePostId,
    url: p.url,
    author: p.author,
    title: p.title,
    content: p.content,
    postedAt: p.postedAt,
    metrics: p.metrics,
    runId,
  }));
  await db
    .insert(rawPosts)
    .values(rows)
    .onConflictDoUpdate({
      target: [rawPosts.source, rawPosts.sourcePostId],
      // `excluded` refers to the row proposed for insertion, so each conflicting
      // row refreshes with ITS OWN metrics. Never reference a single row here.
      set: { metrics: sql`excluded.metrics`, fetchedAt: new Date() },
    });
  // Re-read ids for the batch. Filtering on sourcePostId alone can over-fetch rows
  // from other sources that happen to share an id; the composite map key keeps
  // those distinct, so they're simply never looked up.
  const found = await db
    .select({ id: rawPosts.id, source: rawPosts.source, sourcePostId: rawPosts.sourcePostId })
    .from(rawPosts)
    .where(
      inArray(
        rawPosts.sourcePostId,
        deduped.map((p) => p.sourcePostId),
      ),
    );
  return new Map(found.map((r) => [`${r.source}:${r.sourcePostId}`, r.id]));
}
