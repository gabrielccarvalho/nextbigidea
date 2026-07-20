import { describe, expect, it } from "vitest";
import { xAdapter } from "../src/adapters/x";
import { linkedinAdapter } from "../src/adapters/linkedin";
import type { PipelineEnv } from "../src/types";

function env(overrides: Partial<PipelineEnv> = {}): PipelineEnv {
  return {
    databaseUrl: "x",
    anthropicApiKey: "x",
    monthlyUsdCap: 5,
    sources: { reddit: false, hackernews: false, producthunt: false, x: false, linkedin: false },
    redditUserAgent: "t",
    ...overrides,
  };
}

describe("degradable adapters enablement", () => {
  it("x is disabled without a session cookie even when the flag is on", () => {
    const e = env({ sources: { ...env().sources, x: true } });
    expect(xAdapter.enabled(e)).toBe(false);
  });

  it("x is enabled only with flag AND cookie", () => {
    const e = env({ sources: { ...env().sources, x: true }, xSessionCookie: "auth_token=abc" });
    expect(xAdapter.enabled(e)).toBe(true);
  });

  it("linkedin is disabled without a session cookie", () => {
    const e = env({ sources: { ...env().sources, linkedin: true } });
    expect(linkedinAdapter.enabled(e)).toBe(false);
  });
});
