import type { PipelineEnv, RawPost, SourceAdapter } from "../types";

interface HnHit {
  objectID?: string;
  title?: string;
  story_text?: string | null;
  author?: string;
  points?: number;
  num_comments?: number;
  created_at_i?: number;
}

export function parseHnHits(json: unknown): RawPost[] {
  const hits = (json as { hits?: HnHit[] })?.hits;
  if (!Array.isArray(hits)) return [];
  const out: RawPost[] = [];
  for (const h of hits) {
    if (!h.objectID) continue;
    out.push({
      source: "hackernews",
      sourcePostId: h.objectID,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: h.author,
      title: h.title,
      content: h.story_text ?? "",
      postedAt: h.created_at_i ? new Date(h.created_at_i * 1000) : undefined,
      metrics: { points: h.points ?? 0, comments: h.num_comments ?? 0 },
    });
  }
  return out;
}

export const hackerNewsAdapter: SourceAdapter = {
  name: "hackernews",
  enabled: (env) => env.sources.hackernews,
  async fetchPosts(since: Date, _env: PipelineEnv): Promise<RawPost[]> {
    const sinceTs = Math.floor(since.getTime() / 1000);
    const query = encodeURIComponent("ask HN tool");
    const url =
      `https://hn.algolia.com/api/v1/search_by_date` +
      `?query=${query}&tags=ask_hn&numericFilters=created_at_i>${sinceTs}&hitsPerPage=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`hn HTTP ${res.status}`);
    return parseHnHits(await res.json());
  },
};
