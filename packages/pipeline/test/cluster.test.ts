import { describe, expect, it } from "vitest";
import { slugify, parseThemes, topByEngagement } from "../src/stages/themes";
import type { RawPost } from "../src/types";

function post(id: string, metrics: Record<string, number>): RawPost {
  return { source: "reddit", sourcePostId: id, url: "u", content: "c", metrics };
}

describe("slugify", () => {
  it("lowercases, strips punctuation, and hyphenates", () => {
    expect(slugify("Auto-Invoice Generator for Stripe!")).toBe("auto-invoice-generator-for-stripe");
  });
  it("collapses whitespace and trims hyphens", () => {
    expect(slugify("  Two   Words  ")).toBe("two-words");
  });
  // ideas.slug is UNIQUE — an empty slug would collide on the second such title.
  it("never returns an empty slug", () => {
    expect(slugify("???")).toBe("idea");
    expect(slugify("")).toBe("idea");
    expect(slugify("   ")).toBe("idea");
  });
});

describe("parseThemes", () => {
  it("extracts theme objects from a JSON block in Haiku output", () => {
    const raw =
      'Here are the themes:\n[{"title":"Invoice automation","postKeys":["reddit:a","hackernews:b"]},{"title":"Pricing tracker","postKeys":["reddit:c"]}]';
    const themes = parseThemes(raw);
    expect(themes).toHaveLength(2);
    expect(themes[0]).toEqual({ title: "Invoice automation", postKeys: ["reddit:a", "hackernews:b"] });
  });
  it("returns [] when no JSON array is present", () => {
    expect(parseThemes("no themes found")).toEqual([]);
  });
  // parseThemes consumes untrusted model output. The defensive branches below
  // all exist in the implementation; these tests are what stop them silently
  // rotting into no-ops.
  it("returns [] when the bracketed text is not valid JSON", () => {
    expect(parseThemes('Here you go: [{"title": "x",}]')).toEqual([]);
  });

  it("drops entries missing title or postKeys", () => {
    const out = parseThemes(
      '[{"title":"ok","postKeys":["reddit:a"]},{"title":"no-keys"},{"postKeys":["reddit:b"]}]',
    );
    expect(out).toEqual([{ title: "ok", postKeys: ["reddit:a"] }]);
  });

  it("drops entries whose title is not a string", () => {
    expect(parseThemes('[{"title":123,"postKeys":["reddit:a"]}]')).toEqual([]);
  });
});

describe("topByEngagement", () => {
  it("sorts descending by the sum of each post's metrics values", () => {
    const posts = [
      post("low", { upvotes: 2, comments: 1 }),
      post("high", { upvotes: 50, comments: 10 }),
      post("mid", { upvotes: 10, comments: 5 }),
    ];
    const result = topByEngagement(posts, 3);
    expect(result.map((p) => p.sourcePostId)).toEqual(["high", "mid", "low"]);
  });

  it("respects the limit", () => {
    const posts = [post("a", { x: 3 }), post("b", { x: 1 }), post("c", { x: 2 })];
    const result = topByEngagement(posts, 2);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.sourcePostId)).toEqual(["a", "c"]);
  });

  it("treats a post with an empty metrics object as zero engagement", () => {
    const posts = [post("empty", {}), post("some", { x: 1 })];
    const result = topByEngagement(posts, 2);
    expect(result.map((p) => p.sourcePostId)).toEqual(["some", "empty"]);
  });

  it("does not mutate the input array", () => {
    const posts = [post("a", { x: 1 }), post("b", { x: 5 })];
    const original = [...posts];
    topByEngagement(posts, 2);
    expect(posts).toEqual(original);
  });
});

describe("topByEngagement postedAt tiebreak", () => {
  // HN comment hits carry no points and no comment count, so every one sums to 0 and
  // the engagement sort cannot order them. Without a tiebreak, "top 150" was whatever
  // order the fetch produced.
  const zeroMetricPost = (id: string, iso: string): RawPost => ({
    source: "hackernews",
    sourcePostId: id,
    url: `https://news.ycombinator.com/item?id=${id}`,
    content: `comment ${id}`,
    metrics: {},
    postedAt: new Date(iso),
  });

  it("orders zero-metric posts newest first", () => {
    const posts = [
      zeroMetricPost("old", "2026-07-01T00:00:00Z"),
      zeroMetricPost("new", "2026-07-20T00:00:00Z"),
      zeroMetricPost("mid", "2026-07-10T00:00:00Z"),
    ];
    expect(topByEngagement(posts, 3).map((p) => p.sourcePostId)).toEqual(["new", "mid", "old"]);
  });

  it("never lets recency outrank real engagement", () => {
    const engaged: RawPost = {
      source: "hackernews",
      sourcePostId: "engaged",
      url: "u",
      content: "story",
      metrics: { points: 200, comments: 50 },
      postedAt: new Date("2026-07-01T00:00:00Z"),
    };
    const recent = zeroMetricPost("recent", "2026-07-20T00:00:00Z");
    expect(topByEngagement([recent, engaged], 2)[0]!.sourcePostId).toBe("engaged");
  });
});

describe("chunkByEngagement", () => {
  const posts = [
    post("low", { points: 1 }),
    post("high", { points: 100 }),
    post("mid", { points: 50 }),
    post("tiny", { points: 0 }),
    post("top", { points: 999 }),
  ];

  it("splits into engagement-ordered chunks of the given size", async () => {
    const { chunkByEngagement } = await import("../src/stages/themes");
    const chunks = chunkByEngagement(posts, 2);
    expect(chunks.map((c) => c.map((p) => p.sourcePostId))).toEqual([
      ["top", "high"],
      ["mid", "low"],
      ["tiny"],
    ]);
  });

  it("returns no chunks for empty input and does not mutate its input", async () => {
    const { chunkByEngagement } = await import("../src/stages/themes");
    expect(chunkByEngagement([], 3)).toEqual([]);
    const before = posts.map((p) => p.sourcePostId);
    chunkByEngagement(posts, 2);
    expect(posts.map((p) => p.sourcePostId)).toEqual(before);
  });
});
