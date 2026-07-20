import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePhPosts } from "../src/adapters/producthunt";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/ph-posts.json"), "utf8"));

describe("parsePhPosts", () => {
  it("maps GraphQL edges to RawPosts", () => {
    const posts = parsePhPosts(fixture);
    expect(posts).toHaveLength(1);
    const p = posts[0]!;
    expect(p.source).toBe("producthunt");
    expect(p.sourcePostId).toBe("700001");
    expect(p.url).toBe("https://www.producthunt.com/posts/invoiceauto");
    expect(p.title).toBe("InvoiceAuto");
    expect(p.content).toContain("Auto-generate invoices");
    expect(p.metrics).toEqual({ votes: 320, comments: 45 });
    expect(p.author).toBe("makerjane");
  });

  it("returns [] on missing edges", () => {
    expect(parsePhPosts({ data: { posts: {} } })).toEqual([]);
  });
});
