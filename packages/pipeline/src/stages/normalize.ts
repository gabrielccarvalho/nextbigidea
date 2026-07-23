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
  // Batched: the neon-http driver serializes every VALUES row into one request
  // payload, and a backfill-sized batch (~6k posts) exceeds its transmit limit
  // ("value too large to transmit"). 500 rows per statement stays far under it;
  // each statement is an independent upsert, so a mid-loop crash loses nothing
  // already written.
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(rawPosts)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: [rawPosts.source, rawPosts.sourcePostId],
        // `excluded` refers to the row proposed for insertion, so each conflicting
        // row refreshes with ITS OWN metrics. Never reference a single row here.
        set: { metrics: sql`excluded.metrics`, fetchedAt: new Date() },
      });
  }
  // Re-read ids for the batch — batched for the same transmit limit as above.
  // Filtering on sourcePostId alone can over-fetch rows from other sources that
  // happen to share an id; the composite map key keeps those distinct, so
  // they're simply never looked up.
  const ids = deduped.map((p) => p.sourcePostId);
  const map = new Map<string, number>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const found = await db
      .select({ id: rawPosts.id, source: rawPosts.source, sourcePostId: rawPosts.sourcePostId })
      .from(rawPosts)
      .where(inArray(rawPosts.sourcePostId, ids.slice(i, i + BATCH)));
    for (const r of found) map.set(`${r.source}:${r.sourcePostId}`, r.id);
  }
  return map;
}
