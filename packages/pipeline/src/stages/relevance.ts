import type { RawPost } from "../types";
import type { HaikuClient } from "../anthropic";

// This prefilter is the ONLY gate before the paid classifier. A phrasing that
// matches nothing here is never evaluated at all, so gaps here are permanent
// blind spots in the product's demand detection — worse than a few extra
// Haiku calls, which the spend cap already bounds.
const SIGNAL_PATTERNS: RegExp[] = [
  // Explicit wishes
  /\bi wish (there was|there were|i had|someone would|somebody would)\b/i,
  // Existence questions
  /\bis there (a|an|any) (tool|app|service|software|platform|way)\b/i,
  /\bdoes (anyone|anybody) know of (a|an|any)\b/i,
  // Active search
  /\blooking for (a|an|some)\b.*\b(tool|app|service|software|platform)\b/i,
  /\bi need (a|an|some)\b.*\b(tool|app|service|software|platform)\b/i,
  // Willingness to pay — the strongest signal. Covers contractions.
  /\b(would pay|i'd pay|i would pay|happily pay|pay good money)\b/i,
  // Gap statements
  /\bthere(?:'s| is| are)? no (good |decent |real )?(tool|app|service|software)\b/i,
  /\b(somebody|someone) should (build|make|create)\b/i,
  // Recommendation requests, word-order tolerant
  /\bany (tool|app|software|service)? ?recommendations?\b/i,
  /\brecommendations? for\b.*\b(tool|app|service|software)\b/i,
];

export function keywordPrefilter(posts: RawPost[]): RawPost[] {
  return posts.filter((p) => {
    const text = `${p.title ?? ""} ${p.content}`;
    return SIGNAL_PATTERNS.some((re) => re.test(text));
  });
}

export async function filterRelevant(posts: RawPost[], client: HaikuClient): Promise<RawPost[]> {
  const pre = keywordPrefilter(posts);
  if (pre.length === 0) return [];
  const relevantIds = await client.classifyDemand(
    pre.map((p) => ({ id: `${p.source}:${p.sourcePostId}`, text: `${p.title ?? ""} ${p.content}` })),
  );
  return pre.filter((p) => relevantIds.has(`${p.source}:${p.sourcePostId}`));
}
