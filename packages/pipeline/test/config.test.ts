import { describe, expect, it } from "vitest";
import { enabledAdapters, parseSinceDays, parseUsdCap } from "../src/config";
import type { PipelineEnv, SourceAdapter } from "../src/types";

function baseEnv(overrides: Partial<PipelineEnv> = {}): PipelineEnv {
  return {
    databaseUrl: "postgres://x",
    openaiApiKey: "sk-x",
    monthlyUsdCap: 5,
    sinceDays: 7,
    sources: {
      reddit: true,
      hackernews: true,
      producthunt: false,
      x: false,
      linkedin: false,
      stackexchange: false,
      github: false,
    },
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
      sources: {
        reddit: false,
        hackernews: false,
        producthunt: false,
        x: false,
        linkedin: false,
        stackexchange: false,
        github: false,
      },
    });
    expect(enabledAdapters(ADAPTERS, env)).toEqual([]);
  });
});

describe("parseSinceDays", () => {
  it("defaults to 7 when unset or blank", () => {
    expect(parseSinceDays(undefined)).toBe(7);
    expect(parseSinceDays("")).toBe(7);
  });

  it("parses a valid positive integer for backfill runs", () => {
    expect(parseSinceDays("180")).toBe(180);
  });

  // A NaN window would compute an Invalid Date `since`, and every adapter
  // would quietly fetch nothing — the same silent-failure shape parseUsdCap
  // guards against.
  it("throws on a non-numeric, zero, or negative value", () => {
    expect(() => parseSinceDays("soon")).toThrow(/positive/);
    expect(() => parseSinceDays("0")).toThrow(/positive/);
    expect(() => parseSinceDays("-4")).toThrow(/positive/);
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
