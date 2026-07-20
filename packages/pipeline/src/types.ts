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
  anthropicApiKey: string;
  monthlyUsdCap: number;
  sources: {
    reddit: boolean;
    hackernews: boolean;
    producthunt: boolean;
    x: boolean;
    linkedin: boolean;
  };
  redditUserAgent: string;
  productHuntToken?: string;
  xSessionCookie?: string;
  linkedinSessionCookie?: string;
}

export interface SourceAdapter {
  readonly name: string;
  enabled(env: PipelineEnv): boolean;
  fetchPosts(since: Date, env: PipelineEnv): Promise<RawPost[]>;
}
