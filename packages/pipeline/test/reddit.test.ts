import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRedditListing } from "../src/adapters/reddit";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures/reddit-search.json"), "utf8"),
);

describe("parseRedditListing", () => {
  it("maps each child to a RawPost with source-prefixed id and full url", () => {
    const posts = parseRedditListing(fixture, "SaaS");
    expect(posts).toHaveLength(2);
    const first = posts[0]!;
    expect(first.source).toBe("reddit");
    expect(first.sourcePostId).toBe("abc123");
    expect(first.url).toBe("https://www.reddit.com/r/SaaS/comments/abc123/i_wish/");
    expect(first.author).toBe("founder42");
    expect(first.title).toContain("auto-generates invoices");
    expect(first.content).toContain("Would pay");
    expect(first.metrics).toEqual({ ups: 87, comments: 34 });
    expect(first.postedAt?.getTime()).toBe(1752900000 * 1000);
  });

  it("returns [] for a malformed listing", () => {
    expect(parseRedditListing({}, "SaaS")).toEqual([]);
  });
});
