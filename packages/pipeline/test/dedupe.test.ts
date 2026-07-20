import { describe, expect, it } from "vitest";
import { dedupeInMemory } from "../src/stages/dedupe";
import type { RawPost } from "../src/types";

// `marker` distinguishes otherwise-identical duplicates so the test can prove
// WHICH occurrence survived. Without it, keeping the first and keeping the last
// are indistinguishable and the test asserts far less than its name claims.
function post(source: string, id: string, marker = ""): RawPost {
  return { source, sourcePostId: id, url: `u/${id}`, title: marker, content: "", metrics: {} };
}

describe("dedupeInMemory", () => {
  it("removes duplicate (source, id) pairs keeping the FIRST occurrence", () => {
    const input = [
      post("reddit", "a", "first"),
      post("reddit", "a", "second"),
      post("hackernews", "a", "other-source"),
    ];
    const out = dedupeInMemory(input);
    expect(out).toHaveLength(2);
    expect(out.map((p) => `${p.source}:${p.sourcePostId}`)).toEqual(["reddit:a", "hackernews:a"]);
    // The surviving reddit:a must be the first one, not the second.
    expect(out[0]!.title).toBe("first");
  });

  it("treats the same id from different sources as distinct", () => {
    const out = dedupeInMemory([post("reddit", "x"), post("hackernews", "x")]);
    expect(out).toHaveLength(2);
  });

  it("returns an empty array unchanged", () => {
    expect(dedupeInMemory([])).toEqual([]);
  });
});
