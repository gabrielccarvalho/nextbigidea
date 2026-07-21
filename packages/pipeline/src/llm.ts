import OpenAI from "openai";

// Two tiers, because the three stages have genuinely different economics.
//
//   bulk    — classifyDemand runs over EVERY fetched post, and clusterPosts sends one
//             large listing. High volume, mechanical judgement.
//   quality — enrichTheme runs once per theme and its JSON *is* the product: the
//             description, MRR range, and validation signals a subscriber pays to read.
//
// Prices are USD per token, verified against OpenAI's published rates (July 2026):
//   gpt-5.6-luna   $1.00 in / $6.00 out per 1M
//   gpt-5.6-terra  $2.50 in / $15.00 out per 1M
// These constants are what the monthly spend cap is computed from. A wrong number
// here does not throw — it silently mis-meters every run — so re-check them against
// OpenAI's pricing page whenever the model changes.
const RATES = {
  bulk: {
    model: "gpt-5.6-luna",
    usdPerInputToken: 1.0 / 1_000_000,
    usdPerOutputToken: 6.0 / 1_000_000,
  },
  quality: {
    model: "gpt-5.6-terra",
    usdPerInputToken: 2.5 / 1_000_000,
    usdPerOutputToken: 15.0 / 1_000_000,
  },
} as const;

export type Tier = keyof typeof RATES;

const MILLICENTS_PER_USD = 100_000;

// Structured Outputs with `strict: true` requires an OBJECT at the schema root, but both
// callers that need a schema want an array. Rather than make every caller hand-roll an
// envelope, `complete()` wraps whatever schema it's given as `{ result: <schema> }` and
// unwraps it on the way back — so callers pass the schema of the value they actually want
// and receive that value's JSON, exactly as the existing parseThemes / parseEnrichedIdea
// already expect.
//
// `strict` also requires every object in the schema to set `additionalProperties: false`
// and list all of its properties in `required`. Schemas passed here must comply.
function envelope(schema: Record<string, unknown>) {
  return {
    type: "json_schema" as const,
    name: "result",
    strict: true,
    schema: {
      type: "object",
      properties: { result: schema },
      required: ["result"],
      additionalProperties: false,
    },
  };
}

export interface LlmClient {
  readonly spentMillicents: number;
  classifyDemand(posts: { id: string; text: string }[]): Promise<Set<string>>;
  complete(
    prompt: string,
    opts?: { maxTokens?: number; tier?: Tier; schema?: Record<string, unknown> },
  ): Promise<string>;
}

// The stages depend on the LlmClient interface above, never on this class. Swapping
// providers again means writing one more implementation of that interface and changing
// the single construction site in run.ts.
export class OpenAiClient implements LlmClient {
  private client: OpenAI;
  private spentUsd = 0;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  get spentMillicents(): number {
    return Math.round(this.spentUsd * MILLICENTS_PER_USD);
  }

  private track(tier: Tier, usage: { input_tokens: number; output_tokens: number }) {
    const rate = RATES[tier];
    this.spentUsd += usage.input_tokens * rate.usdPerInputToken;
    this.spentUsd += usage.output_tokens * rate.usdPerOutputToken;
  }

  async complete(
    prompt: string,
    opts: { maxTokens?: number; tier?: Tier; schema?: Record<string, unknown> } = {},
  ): Promise<string> {
    const tier = opts.tier ?? "quality";
    const res = await this.client.responses.create({
      model: RATES[tier].model,
      input: prompt,
      max_output_tokens: opts.maxTokens ?? 2048,
      ...(opts.schema ? { text: { format: envelope(opts.schema) } } : {}),
    });
    if (res.usage) this.track(tier, res.usage);

    const text = res.output_text ?? "";
    if (!opts.schema) return text;
    // Schema-constrained: hand back the inner value's JSON. A malformed body can only
    // happen if the response was truncated by max_output_tokens, in which case an empty
    // string flows on to the caller's parser, which already returns null/[] for garbage.
    try {
      return JSON.stringify((JSON.parse(text) as { result: unknown }).result);
    } catch {
      return "";
    }
  }

  async classifyDemand(posts: { id: string; text: string }[]): Promise<Set<string>> {
    if (posts.length === 0) return new Set();
    const numbered = posts.map((p, i) => `[${i}] ${p.text.slice(0, 400)}`).join("\n\n");
    const json = await this.complete(
      "You classify social posts. A post is RELEVANT if it expresses unmet demand for a " +
        "software product/tool a founder could build (a wish, a complaint about a missing " +
        "tool, a request for a recommendation that has no good answer). Return the integer " +
        "indices of the relevant posts.\n\n" +
        numbered,
      {
        tier: "bulk",
        maxTokens: 1024,
        schema: { type: "array", items: { type: "integer" } },
      },
    );
    let indices: number[];
    try {
      indices = JSON.parse(json || "[]") as number[];
    } catch {
      return new Set();
    }
    if (!Array.isArray(indices)) return new Set();
    return new Set(indices.map((i) => posts[i]?.id).filter((x): x is string => !!x));
  }
}
