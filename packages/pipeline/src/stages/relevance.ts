import type { RawPost } from "../types";
import type { HaikuClient } from "../anthropic";

const SIGNAL_PATTERNS: RegExp[] = [
  /\bi wish (there was|there were|i had|someone would)\b/i,
  /\bis there (a|an|any) (tool|app|service|software|way)\b/i,
  /\blooking for (a|an|some) (tool|app|service|software)\b/i,
  /\bdoes (anyone|anything) (know|exist)\b.*\b(tool|app|automat)/i,
  /\bwould (pay|happily pay|love)\b.*\b(tool|app|solve|fix)/i,
  /\bany recommendations? for\b.*\b(tool|app|software)/i,
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
