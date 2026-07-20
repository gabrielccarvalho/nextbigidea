import Anthropic from "@anthropic-ai/sdk";

// Haiku 4.5 pricing: $1.00 per 1M input tokens, $5.00 per 1M output tokens.
// Spend accumulates as a USD float and is exposed as integer "millicents"
// (1 millicent = 1e-5 USD) so callers compare against the cap without float drift.
const USD_PER_INPUT_TOKEN = 1.0 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 5.0 / 1_000_000;
const MILLICENTS_PER_USD = 100_000;

const MODEL = "claude-haiku-4-5";

export class HaikuClient {
  private client: Anthropic;
  private spentUsd = 0;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  get spentMillicents(): number {
    return Math.round(this.spentUsd * MILLICENTS_PER_USD);
  }

  private track(usage: { input_tokens: number; output_tokens: number }) {
    this.spentUsd += usage.input_tokens * USD_PER_INPUT_TOKEN;
    this.spentUsd += usage.output_tokens * USD_PER_OUTPUT_TOKEN;
  }

  async classifyDemand(posts: { id: string; text: string }[]): Promise<Set<string>> {
    if (posts.length === 0) return new Set();
    const numbered = posts.map((p, i) => `[${i}] ${p.text.slice(0, 400)}`).join("\n\n");
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You classify social posts. A post is RELEVANT if it expresses unmet demand for a software product/tool a founder could build (a wish, a complaint about a missing tool, a request for a recommendation that has no good answer). Return ONLY a JSON array of the integer indices that are relevant, e.g. [0,3,4].",
      messages: [{ role: "user", content: numbered }],
    });
    if (res.usage) this.track(res.usage);
    const text = res.content.find((b) => b.type === "text")?.text ?? "[]";
    const match = text.match(/\[[\d,\s]*\]/);
    const indices: number[] = match ? JSON.parse(match[0]) : [];
    return new Set(indices.map((i) => posts[i]?.id).filter((x): x is string => !!x));
  }

  async enrich(prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    if (res.usage) this.track(res.usage);
    return res.content.find((b) => b.type === "text")?.text ?? "";
  }
}
