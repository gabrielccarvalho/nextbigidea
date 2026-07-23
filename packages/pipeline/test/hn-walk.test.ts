import { describe, expect, it, vi } from "vitest";
import { walkPhrase } from "../src/adapters/hackernews";

// Minimal Algolia comment hit.
function hit(id: number, createdAt: number) {
  return {
    objectID: String(id),
    comment_text: `i wish there was a tool for thing ${id}`,
    story_title: "Some thread",
    author: "u",
    created_at_i: createdAt,
  };
}

function page(hits: ReturnType<typeof hit>[]) {
  return { ok: true, json: async () => ({ hits }) } as unknown as Response;
}

describe("walkPhrase", () => {
  it("stops after one request when the page is not full", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return page([hit(1, 500), hit(2, 400)]);
    });
    const posts = await walkPhrase('"i wish there was"', 100, fetchImpl, {
      hitsPerPage: 3,
      maxPages: 5,
    });
    expect(posts).toHaveLength(2);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("hitsPerPage=3");
    expect(urls[0]).toContain(encodeURIComponent('"i wish there was"'));
    expect(urls[0]).toContain("created_at_i%3E100");
  });

  it("walks a second window below the oldest hit when the page is full", async () => {
    const urls: string[] = [];
    let call = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      call++;
      // First page is full (3 of 3), oldest hit at t=300; second page is short.
      if (call === 1) return page([hit(1, 500), hit(2, 400), hit(3, 300)]);
      return page([hit(4, 250)]);
    });
    const posts = await walkPhrase("x", 100, fetchImpl, { hitsPerPage: 3, maxPages: 5 });
    expect(posts).toHaveLength(4);
    expect(urls).toHaveLength(2);
    // The follow-up window is capped BELOW the oldest hit already seen.
    expect(urls[1]).toContain("created_at_i%3C300");
    // ...while still bounded by the original since timestamp.
    expect(urls[1]).toContain("created_at_i%3E100");
  });

  it("gives up after maxPages even if every page is full", async () => {
    let t = 10_000;
    const fetchImpl = vi.fn(async () => {
      const hits = [hit(t, t), hit(t - 1, t - 1), hit(t - 2, t - 2)];
      t -= 1000;
      return page(hits);
    });
    const posts = await walkPhrase("x", 0, fetchImpl, { hitsPerPage: 3, maxPages: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(posts).toHaveLength(6);
  });

  it("throws on an HTTP error so the caller can record the phrase failure", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429 }) as unknown as Response);
    await expect(walkPhrase("x", 0, fetchImpl, { hitsPerPage: 3, maxPages: 2 })).rejects.toThrow(
      /429/,
    );
  });
});
