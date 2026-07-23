import type { RawPost } from "../types";
import type { LlmClient } from "../llm";

// This prefilter is the ONLY gate before the paid classifier. A phrasing that
// matches nothing here is never evaluated at all, so gaps here are permanent
// blind spots in the product's demand detection — worse than a few extra
// classifier calls, which the spend cap already bounds.
const SIGNAL_PATTERNS: RegExp[] = [
  // Explicit wishes. No leading "i": "really wish there was" and "wish someone
  // would" are fetched phrasings and must not die here.
  /\bwish (there was|there were|i had|someone would|somebody would)\b/i,
  // Existence questions
  /\bis there (a|an|any) (tool|app|service|software|platform|way)\b/i,
  /\bdoes (anyone|anybody) know (of|a|an)\b/i,
  // Gap questions ("why is there no X", "why isn't there a Y")
  /\bwhy (is there no|isn'?t there)\b/i,
  // Active search
  /\blooking for (a|an|some)\b.*\b(tool|app|service|software|platform)\b/i,
  /\bi need (a|an|some)\b.*\b(tool|app|service|software|platform)\b/i,
  // Willingness to pay — the strongest signal. Covers contractions.
  /\b(would pay|i'd pay|i would pay|happily pay|pay good money)\b/i,
  // Gap statements. "way" included: "there is no good way to X" is a demand
  // signal even when no artefact noun appears.
  /\bthere(?:'s| is| are)? no (good |decent |real )?(tool|app|service|software|way)\b/i,
  /\b(somebody|someone) should (build|make|create)\b/i,
  /\bthere should be (a|an)\b/i,
  // Recommendation requests, word-order tolerant
  /\bany (tool|app|software|service)? ?recommendations?\b/i,
  /\brecommendations? for\b.*\b(tool|app|service|software)\b/i,
  // Software Recommendations SE style: the title leads with the artefact
  // ("Software to batch-rename photos?"). Deliberately the loosest pattern
  // here — the prefilter is a cost gate, and the paid classifier is the
  // precision gate.
  /\b(software|tool|app|program|extension) (to|for|that) \w/i,
];

export function keywordPrefilter(posts: RawPost[]): RawPost[] {
  return posts.filter((p) => {
    const text = `${p.title ?? ""} ${p.content}`;
    return SIGNAL_PATTERNS.some((re) => re.test(text));
  });
}

// classifyDemand is one API call per invocation. Classification is per-post
// (each post is judged independently of the others), so splitting the
// prefiltered set into fixed-size batches is semantically safe — unlike
// clustering, nothing here compares posts against each other. Batching also
// keeps a single call from growing past the model's context window at high
// post volume.
const CLASSIFY_BATCH_SIZE = 100;

export async function filterRelevant(
  posts: RawPost[],
  client: LlmClient,
  shouldContinue: () => boolean = () => true,
): Promise<RawPost[]> {
  const pre = keywordPrefilter(posts);
  if (pre.length === 0) return [];
  const result: RawPost[] = [];
  for (let i = 0; i < pre.length; i += CLASSIFY_BATCH_SIZE) {
    // Checked before each batch, not just once, so a cap tripped by an
    // earlier batch's spend stops the loop before the next paid call.
    // Returning the partial result accumulated so far is correct — it is
    // not an error case.
    if (!shouldContinue()) break;
    const batch = pre.slice(i, i + CLASSIFY_BATCH_SIZE);
    const relevantIds = await client.classifyDemand(
      batch.map((p) => ({ id: `${p.source}:${p.sourcePostId}`, text: `${p.title ?? ""} ${p.content}` })),
    );
    result.push(...batch.filter((p) => relevantIds.has(`${p.source}:${p.sourcePostId}`)));
  }
  return result;
}
