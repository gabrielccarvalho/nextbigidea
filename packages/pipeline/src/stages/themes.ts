// Pure helpers for the clustering stage. Deliberately free of any `@workspace/db`
// import: that package throws at import time when DATABASE_URL is unset, which
// would otherwise force a fake connection string into the test environment.
// Mirrors the dedupe.ts / normalize.ts split from Task 7.

import type { RawPost } from "../types";

function sumMetrics(metrics: Record<string, number>): number {
  return Object.values(metrics).reduce((total, v) => total + v, 0);
}

// Selects the highest-signal posts for clusterPosts to consider, bounding the
// size of its single `complete` call. Sorts a COPY — never mutates the input,
// since callers (and their own callers) may still hold a reference to the
// original ordering.
//
// The postedAt tiebreak exists because HN comment hits carry no points and no
// comment count — Algolia simply omits both — so every comment sums to 0 and the
// engagement sort cannot order them at all. Without a tiebreak the "top 150" was
// whatever arbitrary order the fetch happened to produce. Recency is the only real
// signal available for comments, and it is applied as a tiebreak rather than folded
// into the metrics so it can never outrank genuine engagement on posts that have it.
export function topByEngagement(posts: RawPost[], limit: number): RawPost[] {
  return [...posts]
    .sort((a, b) => {
      const byMetrics = sumMetrics(b.metrics) - sumMetrics(a.metrics);
      if (byMetrics !== 0) return byMetrics;
      return (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0);
    })
    .slice(0, limit);
}

// Splits the full relevant set into engagement-ordered chunks for clustering.
// One clusterPosts call is bounded (fragmenting a single call would split
// themes), but a backfill run can carry far more than one call's worth of
// posts — so the orchestrator clusters chunk by chunk instead of silently
// dropping everything beyond the first MAX_CLUSTER_POSTS. Cross-chunk theme
// duplication is handled by findSimilarIdea: each chunk's themes are matched
// against ideas already persisted, including ones created by earlier chunks
// in the same run.
export function chunkByEngagement(posts: RawPost[], size: number): RawPost[][] {
  const ordered = topByEngagement(posts, posts.length);
  const chunks: RawPost[][] = [];
  for (let i = 0; i < ordered.length; i += size) {
    chunks.push(ordered.slice(i, i + size));
  }
  return chunks;
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  // A punctuation-only title ("???", "!!!") reduces to "". `ideas.slug` is
  // UNIQUE, so an empty slug collides the moment a second such title appears.
  // Never hand back an empty slug — callers shouldn't have to know this.
  return slug || "idea";
}

export function parseThemes(text: string): { title: string; postKeys: string[] }[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t) => t && typeof t.title === "string" && Array.isArray(t.postKeys))
      .map((t) => ({ title: t.title as string, postKeys: t.postKeys as string[] }));
  } catch {
    return [];
  }
}
