import { describe, expect, it } from "vitest";
import { dedupeInMemory } from "../src/stages/normalize";
import type { RawPost } from "../src/types";

function post(source: string, id: string): RawPost {
  return { source, sourcePostId: id, url: `u/${id}`, content: "", metrics: {} };
}

describe("dedupeInMemory", () => {
  it("removes duplicate (source, id) pairs keeping the first occurrence", () => {
    const input = [post("reddit", "a"), post("reddit", "a"), post("hackernews", "a")];
    const out = dedupeInMemory(input);
    expect(out).toHaveLength(2);
    expect(out.map((p) => `${p.source}:${p.sourcePostId}`)).toEqual(["reddit:a", "hackernews:a"]);
  });

  it("returns an empty array unchanged", () => {
    expect(dedupeInMemory([])).toEqual([]);
  });
});
