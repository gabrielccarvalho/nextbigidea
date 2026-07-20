// Pure helpers for the enrich stage. Deliberately free of any `@workspace/db`
// import: that package throws at import time when DATABASE_URL is unset, which
// would otherwise force a fake connection string into the test environment.
// Mirrors the dedupe.ts / normalize.ts and themes.ts / cluster.ts splits.
import type { EnrichedIdea } from "../types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function parseEnrichedIdea(text: string): EnrichedIdea | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const n = (k: string) => (typeof raw[k] === "number" ? (raw[k] as number) : undefined);
  const title = s("title");
  const oneLiner = s("oneLiner");
  const description = s("description");
  const niche = s("niche");
  if (!title || !oneLiner || !description || !niche) return null;
  return {
    title,
    oneLiner,
    description,
    niche,
    keywords: s("keywords") ?? "",
    demandScore: clamp(Math.round(n("demandScore") ?? 0), 0, 100),
    mrrLow: Math.max(0, Math.round(n("mrrLow") ?? 0)),
    mrrHigh: Math.max(0, Math.round(n("mrrHigh") ?? 0)),
    competitionNotes: s("competitionNotes") ?? "",
    validationSignals: Array.isArray(raw.validationSignals)
      ? (raw.validationSignals as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
  };
}
