import type { PipelineEnv, RawPost, SourceAdapter } from "../types";

// Subreddits and demand-signal queries. Add/remove freely — swappable config.
const SUBREDDITS = ["SaaS", "smallbusiness", "Entrepreneur", "startups"];
const QUERY = '"i wish there was" OR "is there a tool" OR "looking for a tool"';

interface RedditChild {
  data?: {
    id?: string;
    title?: string;
    selftext?: string;
    permalink?: string;
    author?: string;
    created_utc?: number;
    ups?: number;
    num_comments?: number;
  };
}

export function parseRedditListing(json: unknown, _subreddit: string): RawPost[] {
  const children = (json as { data?: { children?: RedditChild[] } })?.data?.children;
  if (!Array.isArray(children)) return [];
  const out: RawPost[] = [];
  for (const c of children) {
    const d = c.data;
    if (!d?.id || !d.permalink) continue;
    out.push({
      source: "reddit",
      sourcePostId: d.id,
      url: `https://www.reddit.com${d.permalink}`,
      author: d.author,
      title: d.title,
      content: d.selftext ?? "",
      postedAt: d.created_utc ? new Date(d.created_utc * 1000) : undefined,
      metrics: { ups: d.ups ?? 0, comments: d.num_comments ?? 0 },
    });
  }
  return out;
}

export const redditAdapter: SourceAdapter = {
  name: "reddit",
  enabled: (env) => env.sources.reddit,
  async fetchPosts(_since: Date, env: PipelineEnv): Promise<RawPost[]> {
    const all: RawPost[] = [];
    for (const sub of SUBREDDITS) {
      const url =
        `https://www.reddit.com/r/${sub}/search.json` +
        `?q=${encodeURIComponent(QUERY)}&restrict_sr=1&sort=new&limit=100&t=week`;
      const res = await fetch(url, { headers: { "user-agent": env.redditUserAgent } });
      if (!res.ok) throw new Error(`reddit ${sub} HTTP ${res.status}`);
      all.push(...parseRedditListing(await res.json(), sub));
    }
    return all;
  },
};
