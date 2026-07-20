import { describe, expect, it } from "vitest";
import { keywordPrefilter } from "../src/stages/relevance";
import type { RawPost } from "../src/types";

function post(content: string, title = ""): RawPost {
  return { source: "reddit", sourcePostId: Math.random().toString(), url: "u", title, content, metrics: {} };
}

describe("keywordPrefilter", () => {
  it("keeps posts expressing a tool/product wish", () => {
    const kept = keywordPrefilter([
      post("I wish there was a tool to auto-reconcile invoices"),
      post("great weather today"),
      post("", "Is there an app that does recurring exports?"),
    ]);
    expect(kept).toHaveLength(2);
  });

  it("is case-insensitive", () => {
    expect(keywordPrefilter([post("I WISH THERE WAS a way to do X")])).toHaveLength(1);
  });
});
