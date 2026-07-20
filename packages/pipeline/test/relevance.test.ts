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

  // Every signal pattern needs at least one example. Without this, a typo in a
  // regex silently creates a permanent blind spot: the paid classifier never
  // sees those posts, and nothing fails.
  it.each([
    ["wish", "I wish there was a tool for this"],
    ["wish-somebody", "I wish somebody would build this"],
    ["is-there", "Is there a platform that handles this?"],
    ["does-anyone-know", "Does anyone know of an alternative?"],
    ["looking-for", "Looking for a tool that syncs these"],
    ["i-need", "I need an app that tracks this"],
    ["would-pay", "I would pay for this"],
    ["contracted-pay", "I'd pay for a tool that fixes this"],
    ["happily-pay", "Would happily pay someone to solve this"],
    ["no-good-tool", "There's no good tool for reconciling these"],
    ["somebody-should", "Somebody should build a service for this"],
    ["any-recommendations", "Any recommendations? Need something for invoicing"],
    ["recommendations-for", "Recommendations for a tool that does exports?"],
  ])("matches the %s phrasing", (_label, text) => {
    expect(keywordPrefilter([post(text)])).toHaveLength(1);
  });

  it("rejects ordinary chatter that mentions no unmet need", () => {
    const kept = keywordPrefilter([
      post("Just shipped v2 of my app, feedback welcome"),
      post("Great tool, been using it for years"),
      post("Here's how I built my SaaS in a weekend"),
    ]);
    expect(kept).toEqual([]);
  });
});
