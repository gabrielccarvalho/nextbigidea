import { unstable_cache } from "next/cache";
import { db, ideas, rawPosts } from "@workspace/db";
import { count, eq, gte, sql } from "drizzle-orm";
import { applyStatsFloor, type LandingStats } from "./stats";

// Kept separate from stats.ts so the floor logic stays unit-testable without a
// database, matching the computeAccess / getViewerAccess split in this codebase.
async function fetchLandingStats(): Promise<LandingStats | null> {
  const [published, scanned, lastWeek] = await Promise.all([
    db.select({ n: count() }).from(ideas).where(eq(ideas.status, "published")),
    db.select({ n: count() }).from(rawPosts),
    db
      .select({ n: count() })
      .from(rawPosts)
      .where(gte(rawPosts.fetchedAt, sql`now() - interval '7 days'`)),
  ]);

  return applyStatsFloor({
    ideasPublished: published[0]?.n ?? 0,
    postsScanned: scanned[0]?.n ?? 0,
    postsLastWeek: lastWeek[0]?.n ?? 0,
  });
}

// Next 16's `use cache` directive replaces `unstable_cache`, but it only
// activates once the whole app opts into Cache Components
// (`cacheComponents: true` in next.config.ts) — an app-wide rendering-model
// switch this task's scope doesn't cover and that this repo hasn't enabled.
// `unstable_cache` needs no such config change and still gives the same
// revalidate-based window (see node_modules next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md).
export const getLandingStats = unstable_cache(fetchLandingStats, ["landing-stats"], {
  revalidate: 60 * 60, // ~1 hour
});
