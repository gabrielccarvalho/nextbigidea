import type { AdapterDeps, PipelineEnv, RawPost, SourceAdapter } from "../types";
import { DEMAND_PHRASES } from "./hackernews";

// GitHub ToS D.5/D.8 license public repo content for third-party commercial use,
// so unlike Reddit/X this source is legally clean (see run.ts registry note).
// Verified against the live API (2026-07): /search/issues is its own 30 req/min
// rate bucket, `advanced_search=true` is required since the 2025-09 legacy-syntax
// removal, and quoted phrases do literal matching. is:issue excludes PRs at the
// query level; parseGithubIssues still drops any that slip through.
const SEARCH_URL = "https://api.github.com/search/issues";

// One essay-length issue body would dominate classifier token spend; the demand
// phrasing this pipeline mines lives in the first paragraphs when it exists at all.
const MAX_BODY_CHARS = 1500;

// 10 phrases at one request each stays far under the 30/min search bucket, but
// GitHub's secondary abuse limits also watch request *pacing* — 2s keeps this
// adapter indistinguishable from a well-behaved single-threaded client.
const PACE_MS = 2000;

interface GhIssue {
  id?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  user?: { login?: string };
  comments?: number;
  reactions?: { total_count?: number };
  created_at?: string;
  pull_request?: unknown;
}

export function parseGithubIssues(json: unknown): RawPost[] {
  const items = (json as { items?: GhIssue[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: RawPost[] = [];
  for (const it of items) {
    if (typeof it.id !== "number" || !it.html_url) continue;
    if (it.pull_request) continue;
    const content = (it.body ?? "").slice(0, MAX_BODY_CHARS);
    if (!content && !it.title) continue;
    out.push({
      source: "github",
      sourcePostId: String(it.id),
      url: it.html_url,
      author: it.user?.login,
      title: it.title,
      content,
      postedAt: it.created_at ? new Date(it.created_at) : undefined,
      metrics: { reactions: it.reactions?.total_count ?? 0, comments: it.comments ?? 0 },
    });
  }
  return out;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const githubAdapter: SourceAdapter = {
  name: "github",
  enabled: (env) => env.sources.github && !!env.githubToken,
  async fetchPosts(since: Date, env: PipelineEnv, deps: AdapterDeps = {}): Promise<RawPost[]> {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const sleep = deps.sleep ?? defaultSleep;
    const sinceDay = since.toISOString().slice(0, 10);
    const all: RawPost[] = [];
    const errors: string[] = [];
    for (let i = 0; i < DEMAND_PHRASES.length; i++) {
      const phrase = DEMAND_PHRASES[i]!;
      if (i > 0) await sleep(PACE_MS);
      const q = `${phrase} is:issue created:>${sinceDay}`;
      const url =
        `${SEARCH_URL}?q=${encodeURIComponent(q)}` +
        `&sort=reactions&order=desc&per_page=100&advanced_search=true`;
      try {
        const res = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${env.githubToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            // GitHub rejects requests without a User-Agent.
            "User-Agent": "nextbigidea-pipeline",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        all.push(...parseGithubIssues(await res.json()));
      } catch (err) {
        // One phrase failing must not lose the other nine. Only a total wipeout
        // is reported as an adapter failure.
        errors.push(`${phrase}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (all.length === 0 && errors.length > 0) {
      throw new Error(`github: all ${errors.length} queries failed — ${errors[0]}`);
    }
    return all;
  },
};
