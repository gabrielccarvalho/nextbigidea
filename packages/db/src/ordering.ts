// Pure helper for the listing queries. Deliberately free of any `./client`
// import: that module throws at import time when DATABASE_URL is unset, which
// would otherwise force a fake connection string into the test environment.
// Mirrors the dedupe.ts / normalize.ts, themes.ts / cluster.ts, and idea.ts /
// enrich.ts splits in packages/pipeline.
import type { Idea } from "./index";

export function orderIdeasForListing(list: Idea[]): Idea[] {
  return [...list].sort((a, b) => {
    if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
    if (b.demandScore !== a.demandScore) return b.demandScore - a.demandScore;
    return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
  });
}
