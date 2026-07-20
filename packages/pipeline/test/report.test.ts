import { describe, expect, it } from "vitest";
import { PipelineRunReport } from "../src/report";

describe("PipelineRunReport", () => {
  it("is success when all sources succeeded", () => {
    const r = new PipelineRunReport();
    r.addSource("reddit", 10);
    r.addSource("hackernews", 5);
    expect(r.status).toBe("success");
  });

  it("is partial when some sources failed but others produced posts", () => {
    const r = new PipelineRunReport();
    r.addSource("reddit", 10);
    r.addSource("x", 0, true, "layout changed");
    expect(r.status).toBe("partial");
  });

  it("is failed when every source failed", () => {
    const r = new PipelineRunReport();
    r.addSource("reddit", 0, true, "HTTP 429");
    expect(r.status).toBe("failed");
  });

  it("serializes per-source stats", () => {
    const r = new PipelineRunReport();
    r.addSource("reddit", 10);
    r.addSource("x", 0, true, "blocked");
    const stats = r.toStats();
    expect(stats.sources).toMatchObject({
      reddit: { fetched: 10, failed: false },
      x: { fetched: 0, failed: true, error: "blocked" },
    });
  });
});
