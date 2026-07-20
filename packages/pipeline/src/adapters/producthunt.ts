import type { PipelineEnv, RawPost, SourceAdapter } from "../types";

interface PhNode {
  id?: string;
  name?: string;
  tagline?: string;
  url?: string;
  votesCount?: number;
  commentsCount?: number;
  createdAt?: string;
  user?: { username?: string };
}

export function parsePhPosts(json: unknown): RawPost[] {
  const edges = (json as { data?: { posts?: { edges?: { node?: PhNode }[] } } })?.data?.posts
    ?.edges;
  if (!Array.isArray(edges)) return [];
  const out: RawPost[] = [];
  for (const e of edges) {
    const n = e.node;
    if (!n?.id || !n.url) continue;
    out.push({
      source: "producthunt",
      sourcePostId: n.id,
      url: n.url,
      author: n.user?.username,
      title: n.name,
      content: n.tagline ?? "",
      postedAt: n.createdAt ? new Date(n.createdAt) : undefined,
      metrics: { votes: n.votesCount ?? 0, comments: n.commentsCount ?? 0 },
    });
  }
  return out;
}

const QUERY = `query($after: DateTime) {
  posts(order: NEWEST, postedAfter: $after, first: 50) {
    edges { node { id name tagline url votesCount commentsCount createdAt user { username } } }
  }
}`;

export const productHuntAdapter: SourceAdapter = {
  name: "producthunt",
  enabled: (env) => env.sources.producthunt && !!env.productHuntToken,
  async fetchPosts(since: Date, env: PipelineEnv): Promise<RawPost[]> {
    if (!env.productHuntToken) throw new Error("PRODUCTHUNT_TOKEN missing");
    const res = await fetch("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.productHuntToken}`,
      },
      body: JSON.stringify({ query: QUERY, variables: { after: since.toISOString() } }),
    });
    if (!res.ok) throw new Error(`producthunt HTTP ${res.status}`);
    return parsePhPosts(await res.json());
  },
};
