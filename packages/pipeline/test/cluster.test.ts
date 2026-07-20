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
