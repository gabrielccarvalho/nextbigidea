import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHnHits } from "../src/adapters/hackernews";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/hn-algolia.json"), "utf8"));

describe("parseHnHits", () => {
  it("maps hits to RawPosts with the HN item url", () => {
    const posts = parseHnHits(fixture);
    expect(posts).toHaveLength(2);
    const first = posts[0]!;
    expect(first.source).toBe("hackernews");
    expect(first.sourcePostId).toBe("39000001");
    expect(first.url).toBe("https://news.ycombinator.com/item?id=39000001");
    expect(first.metrics).toEqual({ points: 45, comments: 20 });
    expect(first.content).toContain("pay for automation");
  });

  it("tolerates null story_text, keeping the post for its title", () => {
    const posts = parseHnHits(fixture);
    // relevance.ts matches against `${title} ${content}`, so a story whose demand
    // lives entirely in its title must survive parsing with empty content.
    expect(posts[1]!.content).toBe("");
    expect(posts[1]!.title).toBeTruthy();
  });
});
