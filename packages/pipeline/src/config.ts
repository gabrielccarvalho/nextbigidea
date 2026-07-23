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

// A NaN or non-positive cap would make every `client.spentMillicents < cap`
// guard false, silently disabling all paid stages instead of capping spend.
// Fail loudly on a malformed value rather than failing closed and quiet.
export function parseUsdCap(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 5;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`PIPELINE_MONTHLY_USD_CAP must be a positive number, got ${JSON.stringify(raw)}`);
  }
  return n;
}

// Same failure shape as parseUsdCap: a NaN or non-positive window would compute
// an Invalid Date `since` and every adapter would quietly fetch nothing.
export function parseSinceDays(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 7;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`PIPELINE_SINCE_DAYS must be a positive number of days, got ${JSON.stringify(raw)}`);
  }
  return n;
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
    openaiApiKey: req("OPENAI_API_KEY"),
    monthlyUsdCap: parseUsdCap(process.env.PIPELINE_MONTHLY_USD_CAP),
    sinceDays: parseSinceDays(process.env.PIPELINE_SINCE_DAYS),
    sources: {
      reddit: flag("SOURCE_REDDIT"),
      hackernews: flag("SOURCE_HACKERNEWS"),
      producthunt: flag("SOURCE_PRODUCTHUNT"),
      x: flag("SOURCE_X"),
      linkedin: flag("SOURCE_LINKEDIN"),
      stackexchange: flag("SOURCE_STACKEXCHANGE"),
      github: flag("SOURCE_GITHUB"),
    },
    redditUserAgent: process.env.REDDIT_USER_AGENT ?? "demand-ideas-bot/0.1",
    productHuntToken: process.env.PRODUCTHUNT_TOKEN,
    xSessionCookie: process.env.X_SESSION_COOKIE,
    linkedinSessionCookie: process.env.LINKEDIN_SESSION_COOKIE,
    stackexchangeKey: process.env.STACKEXCHANGE_KEY,
    githubToken: process.env.GITHUB_TOKEN,
  };
}
