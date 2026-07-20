import { unstable_cache } from "next/cache";
import { count, eq, gte, sql } from "drizzle-orm";
import { applyStatsFloor, type LandingStats } from "./stats";

// Kept separate from stats.ts so the floor logic stays unit-testable without a
// database, matching the computeAccess / getViewerAccess split in this codebase.
//
// `@workspace/db` is imported dynamically, inside this function, rather than
// as a static top-level import. `packages/db/src/client.ts` throws at
// *module-evaluation time* when DATABASE_URL is unset (mirrors the
// access.ts precedent for computeAccess). A static import gets evaluated
// eagerly as soon as this module is resolved — before getLandingStats() (or
// even the try/catch around it) ever runs — so it would crash page.tsx ->
// ProofBar -> landing-stats.ts before any error handling has a chance to
// catch it. A dynamic import defers that evaluation to call time, inside
// the try/catch below.
async function fetchLandingStats(): Promise<LandingStats | null> {
  const { db, ideas, rawPosts } = await import("@workspace/db");

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
const cachedFetchLandingStats = unstable_cache(fetchLandingStats, ["landing-stats"], {
  revalidate: 60 * 60, // ~1 hour
});

// The try/catch wraps the *cached* function rather than living inside
// fetchLandingStats. If a transient DB outage were caught inside the
// cached function, unstable_cache would happily cache the resulting
// `null` for the full revalidate window — hiding the proof bar for up to
// an hour after the database recovers. Catching out here means a failed
// call is never itself cached: the next request just tries fetching (and
// caching) again.
export async function getLandingStats(): Promise<LandingStats | null> {
  try {
    return await cachedFetchLandingStats();
  } catch {
    // DB unreachable, import-time throw from @workspace/db, or a query
    // error — in every case the floor rule in proof-bar.tsx already treats
    // `null` as "don't render this section," so we degrade to that same
    // neutral state rather than 500ing the whole landing page.
    return null;
  }
}
