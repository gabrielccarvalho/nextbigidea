import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { githubAdapter, parseGithubIssues } from "../src/adapters/github";
import type { PipelineEnv } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/gh-issues.json"), "utf8"));

function env(overrides: Partial<PipelineEnv> = {}): PipelineEnv {
  return {
    databaseUrl: "postgres://x",
    openaiApiKey: "sk-x",
    monthlyUsdCap: 5,
    sinceDays: 7,
    sources: {
      reddit: false,
      hackernews: false,
      producthunt: false,
      x: false,
      linkedin: false,
      stackexchange: false,
      github: true,
    },
    redditUserAgent: "test",
    githubToken: "ghp_test",
    ...overrides,
  };
}

describe("parseGithubIssues", () => {
  it("maps issues to RawPosts and skips pull requests", () => {
    const posts = parseGithubIssues(fixture);
    expect(posts).toHaveLength(2);
    const first = posts[0]!;
    expect(first.source).toBe("github");
    expect(first.sourcePostId).toBe("3111222333");
    expect(first.url).toBe("https://github.com/acme/dashboards/issues/42");
    expect(first.author).toBe("octocat");
    expect(first.title).toContain("export dashboards as PDF");
    expect(first.content).toContain("would pay for this");
    expect(first.metrics).toEqual({ reactions: 27, comments: 14 });
    expect(first.postedAt).toEqual(new Date("2026-06-10T12:00:00Z"));
  });

  it("keeps a body-less issue for its title", () => {
    const posts = parseGithubIssues(fixture);
    expect(posts[1]!.content).toBe("");
    expect(posts[1]!.title).toBe("Is there a tool integration planned?");
  });

  it("truncates very long bodies so one essay cannot dominate classifier spend", () => {
    const long = {
      items: [{ ...fixture.items[0], id: 1, body: "x".repeat(5000) }],
    };
    const posts = parseGithubIssues(long);
    expect(posts[0]!.content.length).toBe(1500);
  });

  it("returns an empty array for a malformed payload", () => {
    expect(parseGithubIssues({ message: "rate limited" })).toEqual([]);
    expect(parseGithubIssues(null)).toEqual([]);
  });
});

describe("githubAdapter.fetchPosts", () => {
  it("searches every demand phrase with issue qualifiers, auth and pacing", async () => {
    const urls: string[] = [];
    const headers: Record<string, string>[] = [];
    const waits: number[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      headers.push((init?.headers ?? {}) as Record<string, string>);
      return { ok: true, json: async () => fixture } as unknown as Response;
    });
    const posts = await githubAdapter.fetchPosts(new Date("2026-06-01T00:00:00Z"), env(), {
      fetchImpl,
      sleep: async (ms: number) => {
        waits.push(ms);
      },
    });
    expect(posts.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith("https://api.github.com/search/issues?"))).toBe(true);
    expect(urls.every((u) => u.includes("advanced_search=true"))).toBe(true);
    expect(urls.every((u) => u.includes(encodeURIComponent("is:issue")))).toBe(true);
    expect(urls.every((u) => u.includes(encodeURIComponent("created:>2026-06-01")))).toBe(true);
    expect(urls.some((u) => u.includes(encodeURIComponent('"i wish there was"')))).toBe(true);
    expect(headers.every((h) => h["Authorization"] === "Bearer ghp_test")).toBe(true);
    expect(headers.every((h) => typeof h["User-Agent"] === "string" && h["User-Agent"].length > 0)).toBe(true);
    // The search bucket is 30 req/min — the adapter must pace between requests.
    expect(waits.length).toBeGreaterThan(0);
    expect(waits.every((ms) => ms >= 2000)).toBe(true);
  });

  it("tolerates individual query failures but throws on a total wipeout", async () => {
    let calls = 0;
    const flaky = vi.fn(async () => {
      calls++;
      if (calls === 1) return { ok: true, json: async () => fixture } as unknown as Response;
      return { ok: false, status: 403 } as unknown as Response;
    });
    const posts = await githubAdapter.fetchPosts(new Date(), env(), {
      fetchImpl: flaky,
      sleep: async () => {},
    });
    expect(posts.length).toBeGreaterThan(0);

    const dead = vi.fn(async () => ({ ok: false, status: 403 }) as unknown as Response);
    await expect(
      githubAdapter.fetchPosts(new Date(), env(), { fetchImpl: dead, sleep: async () => {} }),
    ).rejects.toThrow(/github/);
  });

  it("is enabled only with both the source flag and a token", () => {
    expect(githubAdapter.enabled(env())).toBe(true);
    expect(githubAdapter.enabled(env({ githubToken: undefined }))).toBe(false);
    const off = env();
    off.sources.github = false;
    expect(githubAdapter.enabled(off)).toBe(false);
  });
});
