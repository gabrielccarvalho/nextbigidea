import { describe, expect, it, vi } from "vitest";
import { OpenAiClient } from "../src/llm";

type CreateArgs = Record<string, any>;

function fakeOpenAi(responses: Array<Record<string, unknown>>) {
  const calls: CreateArgs[] = [];
  let i = 0;
  return {
    calls,
    client: {
      responses: {
        create: vi.fn(async (args: CreateArgs) => {
          calls.push(args);
          const r = responses[Math.min(i++, responses.length - 1)]!;
          return {
            status: "completed",
            usage: { input_tokens: 10, output_tokens: 10 },
            ...r,
          };
        }),
      },
    },
  };
}

const SCHEMA = { type: "array", items: { type: "integer" } };

describe("OpenAiClient.complete", () => {
  it("requests low reasoning effort on the bulk tier only", async () => {
    const fake = fakeOpenAi([{ output_text: '{"result":[1]}' }]);
    const c = new OpenAiClient("sk-test", fake.client as never);
    await c.complete("p", { tier: "bulk", schema: SCHEMA });
    await c.complete("p", { tier: "quality" });
    expect(fake.calls[0]!.reasoning).toEqual({ effort: "low" });
    expect(fake.calls[1]!.reasoning).toBeUndefined();
  });

  it("retries once with a larger budget when a schema response is truncated", async () => {
    // First response: all output tokens eaten by reasoning, no text — the
    // exact failure that silently zeroed classification in the 365-day run.
    const fake = fakeOpenAi([
      { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "" },
      { output_text: '{"result":[2,3]}' },
    ]);
    const c = new OpenAiClient("sk-test", fake.client as never);
    const out = await c.complete("p", { tier: "bulk", schema: SCHEMA, maxTokens: 1000 });
    expect(out).toBe("[2,3]");
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.max_output_tokens).toBeGreaterThan(fake.calls[0]!.max_output_tokens);
  });

  it("returns empty string when the retry is also truncated, and tracks spend for both calls", async () => {
    const fake = fakeOpenAi([
      { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "" },
    ]);
    const c = new OpenAiClient("sk-test", fake.client as never);
    const out = await c.complete("p", { tier: "bulk", schema: SCHEMA });
    expect(out).toBe("");
    expect(fake.calls).toHaveLength(2);
    expect(c.spentMillicents).toBeGreaterThan(0);
  });

  it("does not retry schema-less completions", async () => {
    const fake = fakeOpenAi([
      { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "partial" },
    ]);
    const c = new OpenAiClient("sk-test", fake.client as never);
    const out = await c.complete("p", {});
    expect(out).toBe("partial");
    expect(fake.calls).toHaveLength(1);
  });
});

describe("OpenAiClient.classifyDemand", () => {
  it("survives a truncated first response via the retry and returns the batch's ids", async () => {
    const fake = fakeOpenAi([
      { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "" },
      { output_text: '{"result":[0]}' },
    ]);
    const c = new OpenAiClient("sk-test", fake.client as never);
    const ids = await c.classifyDemand([
      { id: "hn:1", text: "i wish there was a tool" },
      { id: "hn:2", text: "nice weather" },
    ]);
    expect([...ids]).toEqual(["hn:1"]);
  });
});
