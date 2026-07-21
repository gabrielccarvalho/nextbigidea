import { describe, expect, it } from "vitest";
import { filterRelevant, keywordPrefilter } from "../src/stages/relevance";
import type { RawPost } from "../src/types";
// Type-only import — llm.ts pulls in the OpenAI SDK but not
// `@workspace/db`, so this stays safe to load without DATABASE_URL set.
import type { LlmClient } from "../src/llm";

function post(content: string, title = ""): RawPost {
  return { source: "reddit", sourcePostId: Math.random().toString(), url: "u", title, content, metrics: {} };
}

// Minimal fake satisfying only the method filterRelevant actually calls.
function fakeClient(
  classifyDemand: (posts: { id: string; text: string }[]) => Set<string> | Promise<Set<string>>,
): LlmClient {
  return { classifyDemand } as unknown as LlmClient;
}

function wishPost(i: number): RawPost {
  return post(`I wish there was a tool for case ${i}`);
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

describe("filterRelevant", () => {
  it("batches classification calls in groups of 100 and accumulates results across batches", async () => {
    const posts = Array.from({ length: 250 }, (_, i) => wishPost(i));
    const batchSizes: number[] = [];
    const client = fakeClient((batch) => {
      batchSizes.push(batch.length);
      return new Set(batch.map((p) => p.id)); // mark every post in the batch relevant
    });

    const result = await filterRelevant(posts, client);

    expect(batchSizes).toEqual([100, 100, 50]);
    expect(result).toHaveLength(250);
  });

  it("stops issuing batches once shouldContinue returns false, returning partial results (not throwing)", async () => {
    const posts = Array.from({ length: 250 }, (_, i) => wishPost(i));
    let batchCalls = 0;
    const client = fakeClient((batch) => {
      batchCalls++;
      return new Set(batch.map((p) => p.id));
    });
    let checks = 0;
    const shouldContinue = () => {
      checks++;
      return checks <= 1; // allow only the first batch through
    };

    const result = await filterRelevant(posts, client, shouldContinue);

    expect(batchCalls).toBe(1);
    expect(result).toHaveLength(100);
  });

  it("never calls classifyDemand when shouldContinue is already false", async () => {
    const posts = [wishPost(0)];
    let batchCalls = 0;
    const client = fakeClient((batch) => {
      batchCalls++;
      return new Set(batch.map((p) => p.id));
    });

    const result = await filterRelevant(posts, client, () => false);

    expect(batchCalls).toBe(0);
    expect(result).toEqual([]);
  });

  it("returns [] without calling the client when nothing survives the prefilter", async () => {
    let batchCalls = 0;
    const client = fakeClient((batch) => {
      batchCalls++;
      return new Set(batch.map((p) => p.id));
    });

    const result = await filterRelevant([post("great weather today")], client);

    expect(batchCalls).toBe(0);
    expect(result).toEqual([]);
  });
});
