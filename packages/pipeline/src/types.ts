export interface RawPost {
  source: string;
  sourcePostId: string;
  url: string;
  author?: string;
  title?: string;
  content: string;
  postedAt?: Date;
  metrics: Record<string, number>;
}

export interface EnrichedIdea {
  title: string;
  oneLiner: string;
  description: string;
  niche: string;
  keywords: string;
  demandScore: number; // 0-100
  mrrLow: number; // whole USD
  mrrHigh: number;
  competitionNotes: string;
  validationSignals: string[];
}

export interface PipelineEnv {
  databaseUrl: string;
  openaiApiKey: string;
  monthlyUsdCap: number;
  // How far back adapters fetch, in days. 7 for the weekly cron; raised for
  // one-off backfill runs that seed the catalogue from historical posts.
  sinceDays: number;
  sources: {
    reddit: boolean;
    hackernews: boolean;
    producthunt: boolean;
    x: boolean;
    linkedin: boolean;
    stackexchange: boolean;
    github: boolean;
  };
  redditUserAgent: string;
  productHuntToken?: string;
  xSessionCookie?: string;
  linkedinSessionCookie?: string;
  // Optional: lifts the Stack Exchange quota from 300 to 10,000 req/day.
  stackexchangeKey?: string;
  githubToken?: string;
}

// Injectable I/O for adapters, so tests can drive fetchPosts without network
// access or real timers. Production callers pass nothing.
export interface AdapterDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface SourceAdapter {
  readonly name: string;
  enabled(env: PipelineEnv): boolean;
  fetchPosts(since: Date, env: PipelineEnv, deps?: AdapterDeps): Promise<RawPost[]>;
}
