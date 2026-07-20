import { SOURCES } from "./content";

export type RawStats = {
  ideasPublished: number;
  postsScanned: number;
  postsLastWeek: number;
};

export type LandingStats = RawStats & { sources: number };

// Below these numbers the proof bar undersells the product, so we hide it
// entirely. An absent stat bar reads as neutral; a weak one reads as evidence
// that there isn't much here.
export const STATS_FLOOR = {
  ideasPublished: 25,
  postsScanned: 2_000,
} as const;

// Deliberately derived from the static SOURCES constant, NOT
// count(distinct raw_posts.source). The pipeline scrapes X and LinkedIn
// best-effort, and we do not claim them. Deriving this from the database
// would silently start advertising sources we don't reliably cover the
// moment a single stray row landed. SOURCES is a hardcoded, reviewed list —
// deriving from it (rather than duplicating its length as a separate literal)
// is what keeps this number in sync with the hero animation's source count.
const CLAIMED_SOURCES = SOURCES.length;

export function applyStatsFloor(raw: RawStats): LandingStats | null {
  if (raw.ideasPublished < STATS_FLOOR.ideasPublished) return null;
  if (raw.postsScanned < STATS_FLOOR.postsScanned) return null;
  return { ...raw, sources: CLAIMED_SOURCES };
}
