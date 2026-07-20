import type { PipelineEnv, SourceAdapter } from "./types";
export type { PipelineEnv } from "./types";

// Pure: filters a caller-supplied adapter list against the env flags.
// The caller owns the list (see the ADAPTERS array in run.ts) so there is
// exactly one registry, and this stays testable without pulling Playwright
// into the import graph. Swapping an unofficial adapter for an official one
// later means editing that one array — nothing here changes.
export function enabledAdapters(adapters: SourceAdapter[], env: PipelineEnv): SourceAdapter[] {
  return adapters.filter((a) => a.enabled(env));
}

export function loadEnv(): PipelineEnv {
  const req = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  const flag = (k: string): boolean => process.env[k] === "true";
  return {
    databaseUrl: req("DATABASE_URL"),
    anthropicApiKey: req("ANTHROPIC_API_KEY"),
    monthlyUsdCap: Number(process.env.PIPELINE_MONTHLY_USD_CAP ?? "5"),
    sources: {
      reddit: flag("SOURCE_REDDIT"),
      hackernews: flag("SOURCE_HACKERNEWS"),
      producthunt: flag("SOURCE_PRODUCTHUNT"),
      x: flag("SOURCE_X"),
      linkedin: flag("SOURCE_LINKEDIN"),
    },
    redditUserAgent: process.env.REDDIT_USER_AGENT ?? "demand-ideas-bot/0.1",
    productHuntToken: process.env.PRODUCTHUNT_TOKEN,
    xSessionCookie: process.env.X_SESSION_COOKIE,
    linkedinSessionCookie: process.env.LINKEDIN_SESSION_COOKIE,
  };
}
