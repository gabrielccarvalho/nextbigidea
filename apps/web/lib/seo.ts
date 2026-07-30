// Google renders roughly 155–160 characters of a meta description and drops
// the rest. Model-written idea copy overshoots routinely — niches run to 180
// characters and one-liners to 189 — so anything headed for a description tag
// gets clamped here rather than trusting the source field to behave.
export const MAX_DESCRIPTION = 155;

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

// Cut to `max` characters on a word boundary. A mid-word cut reads like a
// rendering bug in a search result, and punctuation left dangling by the cut
// ("…workflows," or "…teams -") reads worse once a suffix is joined onto it.
// The 0.5 floor is the escape hatch for a pathological single long token,
// where honoring the word boundary would throw away most of the budget.
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return body.replace(/[\s,;:.–—-]+$/, "");
}

// For copy that stands on its own — a free idea's one-liner.
export function clampDescription(text: string, max: number = MAX_DESCRIPTION): string {
  const s = normalize(text);
  return s.length <= max ? s : `${clip(s, max - 1)}…`;
}

const LOCKED_SUFFIX = " — scored demand evidence, with the source posts behind it.";

// A locked idea's description may only carry what its page already shows an
// unpaid viewer, which is the niche and nothing else. The measured fields
// (demand score, ask count, MRR range) are the product, so the copy sells the
// shape of the opportunity without quoting a single number from it.
export function lockedIdeaDescription(niche: string): string {
  return clip(normalize(niche), MAX_DESCRIPTION - LOCKED_SUFFIX.length) + LOCKED_SUFFIX;
}
