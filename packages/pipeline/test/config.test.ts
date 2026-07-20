import { describe, expect, it } from "vitest";
import { enabledAdapters } from "../src/config";
import type { PipelineEnv, SourceAdapter } from "../src/types";

function baseEnv(overrides: Partial<PipelineEnv> = {}): PipelineEnv {
  return {
    databaseUrl: "postgres://x",
    anthropicApiKey: "sk-x",
    monthlyUsdCap: 5,
    sources: { reddit: true, hackernews: true, producthunt: false, x: false, linkedin: false },
    redditUserAgent: "test",
    ...overrides,
  };
}

function fake(name: string, enabled: (e: PipelineEnv) => boolean): SourceAdapter {
  return { name, enabled, fetchPosts: async () => [] };
}

const ADAPTERS: SourceAdapter[] = [
  fake("reddit", (e) => e.sources.reddit),
  fake("hackernews", (e) => e.sources.hackernews),
  fake("producthunt", (e) => e.sources.producthunt),
];

describe("enabledAdapters", () => {
  it("returns only adapters whose source flag is true", () => {
    const names = enabledAdapters(ADAPTERS, baseEnv()).map((a) => a.name).sort();
    expect(names).toEqual(["hackernews", "reddit"]);
  });

  it("returns an empty list when all sources are disabled", () => {
    const env = baseEnv({
      sources: { reddit: false, hackernews: false, producthunt: false, x: false, linkedin: false },
    });
    expect(enabledAdapters(ADAPTERS, env)).toEqual([]);
  });
});
