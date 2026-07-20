import { describe, expect, it } from "vitest";
import { enabledAdapters, parseUsdCap } from "../src/config";
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

describe("parseUsdCap", () => {
  it("defaults to 5 when unset or blank", () => {
    expect(parseUsdCap(undefined)).toBe(5);
    expect(parseUsdCap("")).toBe(5);
  });

  it("parses a valid positive number", () => {
    expect(parseUsdCap("12.5")).toBe(12.5);
  });

  // A NaN cap would make every `spent < cap` guard false, silently disabling
  // all paid stages instead of capping them.
  it("throws on a non-numeric value rather than yielding NaN", () => {
    expect(() => parseUsdCap("five")).toThrow(/positive number/);
  });

  it("throws on zero or negative", () => {
    expect(() => parseUsdCap("0")).toThrow(/positive number/);
    expect(() => parseUsdCap("-3")).toThrow(/positive number/);
  });
});
