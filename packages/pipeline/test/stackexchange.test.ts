import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseSeItems, stackExchangeAdapter } from "../src/adapters/stackexchange";
import type { PipelineEnv } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/se-search.json"), "utf8"));

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
      stackexchange: true,
      github: false,
    },
    redditUserAgent: "test",
    ...overrides,
  };
}

describe("parseSeItems", () => {
  it("maps items to RawPosts, decoding HTML in title and body", () => {
    const posts = parseSeItems(fixture, "softwarerecs");
    const first = posts[0]!;
    expect(first.source).toBe("stackexchange");
    // question_id is only unique per site, so the site is baked into the id.
    expect(first.sourcePostId).toBe("softwarerecs-123456");
    expect(first.url).toBe(
      "https://softwarerecs.stackexchange.com/questions/123456/is-there-a-tool-to-sync-smart-playlists",
    );
    expect(first.author).toBe("jane_doe");
    expect(first.title).toBe('Is there a tool to sync "smart" playlists across devices?');
    // &#39; and &#x27; both decode to apostrophes; tags are stripped.
    expect(first.content).toContain("I'm looking for a tool");
    expect(first.content).toContain("I'd pay for something reliable.");
    expect(first.metrics).toEqual({ score: 12, answers: 3 });
    expect(first.postedAt).toEqual(new Date(1750000000 * 1000));
  });

  it("keeps a body-less item for its title and skips items without an id", () => {
    const posts = parseSeItems(fixture, "superuser");
    expect(posts).toHaveLength(2);
    expect(posts[1]!.sourcePostId).toBe("superuser-654321");
    expect(posts[1]!.content).toBe("");
    expect(posts[1]!.title).toBe("Software to batch-rename photos by EXIF date?");
  });

  it("returns an empty array for a malformed payload", () => {
    expect(parseSeItems({ error_id: 502 }, "superuser")).toEqual([]);
    expect(parseSeItems(null, "superuser")).toEqual([]);
  });
});

describe("stackExchangeAdapter.fetchPosts", () => {
  it("queries every site/phrase pair and aggregates the results", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return { ok: true, json: async () => fixture } as unknown as Response;
    });
    const posts = await stackExchangeAdapter.fetchPosts(new Date("2026-01-01"), env(), {
      fetchImpl,
      sleep: async () => {},
    });
    expect(posts.length).toBeGreaterThan(0);
    // Every requested URL is a phrase search or the softwarerecs harvest, always windowed.
    expect(urls.every((u) => u.includes("/2.3/search/advanced?") || u.includes("/2.3/questions?"))).toBe(true);
    expect(urls.every((u) => u.includes("fromdate="))).toBe(true);
    expect(urls.some((u) => u.includes("site=softwarerecs"))).toBe(true);
    expect(urls.some((u) => u.includes("site=superuser"))).toBe(true);
    // Phrases arrive quoted so SE does literal matching, mirroring the HN adapter.
    expect(urls.some((u) => u.includes(encodeURIComponent('"wish there was"')))).toBe(true);
  });

  it("also harvests softwarerecs wholesale — every question there is a tool request", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return { ok: true, json: async () => fixture } as unknown as Response;
    });
    await stackExchangeAdapter.fetchPosts(new Date("2026-01-01"), env(), {
      fetchImpl,
      sleep: async () => {},
    });
    const harvest = urls.filter((u) => u.includes("/2.3/questions?"));
    expect(harvest.length).toBeGreaterThan(0);
    expect(harvest.every((u) => u.includes("site=softwarerecs"))).toBe(true);
    expect(harvest.every((u) => u.includes("filter=withbody"))).toBe(true);
  });

  it("adds the key parameter only when a key is configured", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return { ok: true, json: async () => fixture } as unknown as Response;
    });
    await stackExchangeAdapter.fetchPosts(new Date(), env(), { fetchImpl, sleep: async () => {} });
    expect(urls.every((u) => !u.includes("key="))).toBe(true);

    urls.length = 0;
    await stackExchangeAdapter.fetchPosts(new Date(), env({ stackexchangeKey: "abc123" }), {
      fetchImpl,
      sleep: async () => {},
    });
    expect(urls.every((u) => u.includes("key=abc123"))).toBe(true);
  });

  it("tolerates individual query failures but throws on a total wipeout", async () => {
    let calls = 0;
    const flaky = vi.fn(async () => {
      calls++;
      if (calls === 1) return { ok: true, json: async () => fixture } as unknown as Response;
      return { ok: false, status: 503 } as unknown as Response;
    });
    const posts = await stackExchangeAdapter.fetchPosts(new Date(), env(), {
      fetchImpl: flaky,
      sleep: async () => {},
    });
    expect(posts.length).toBeGreaterThan(0);

    const dead = vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response);
    await expect(
      stackExchangeAdapter.fetchPosts(new Date(), env(), { fetchImpl: dead, sleep: async () => {} }),
    ).rejects.toThrow(/stackexchange/);
  });

  it("honours the backoff field before issuing the next request", async () => {
    const waits: number[] = [];
    const withBackoff = { ...fixture, backoff: 12 };
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return { ok: true, json: async () => (calls === 1 ? withBackoff : fixture) } as unknown as Response;
    });
    await stackExchangeAdapter.fetchPosts(new Date(), env(), {
      fetchImpl,
      sleep: async (ms: number) => {
        waits.push(ms);
      },
    });
    expect(waits).toContain(12_000);
  });

  it("is enabled only when the stackexchange source flag is on", () => {
    expect(stackExchangeAdapter.enabled(env())).toBe(true);
    const off = env();
    off.sources.stackexchange = false;
    expect(stackExchangeAdapter.enabled(off)).toBe(false);
  });
});
