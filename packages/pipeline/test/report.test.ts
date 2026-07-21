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

describe("PipelineRunReport.isAlarming", () => {
  // Regression guard for the first real production run: reddit 403'd, hackernews
  // returned 27 posts, status was "partial", and the process exited 0 — a green
  // check for a run that produced nothing.
  it("is alarming when a source failed even though another succeeded", () => {
    const r = new PipelineRunReport();
    r.addSource("hackernews", 27);
    r.addSource("reddit", 0, true, "reddit SaaS HTTP 403");
    r.ideasCreated = 3;
    expect(r.status).toBe("partial");
    expect(r.isAlarming).toBe(true);
    expect(r.alarmReason).toContain("reddit");
    expect(r.alarmReason).toContain("403");
  });

  it("is alarming when every source succeeded but no ideas came out", () => {
    const r = new PipelineRunReport();
    r.addSource("hackernews", 27);
    expect(r.status).toBe("success");
    expect(r.isAlarming).toBe(true);
    expect(r.alarmReason).toContain("no ideas");
  });

  it("counts updated ideas as productive, not just created ones", () => {
    const r = new PipelineRunReport();
    r.addSource("hackernews", 27);
    r.ideasUpdated = 2;
    expect(r.isAlarming).toBe(false);
    expect(r.alarmReason).toBeNull();
  });

  it("is not alarming on a clean, productive run", () => {
    const r = new PipelineRunReport();
    r.addSource("hackernews", 27);
    r.ideasCreated = 4;
    expect(r.isAlarming).toBe(false);
  });
});

describe("decodeHtml", () => {
  it("decodes the entities that broke the prefilter", async () => {
    const { decodeHtml } = await import("../src/adapters/hackernews");
    // A real comment_text from the live API renders "it's" as "it&#x27;s"; the
    // relevance prefilter matches /\bi'd pay\b/i and would never fire on the raw form.
    expect(decodeHtml("I doubt it&#x27;s perfect")).toBe("I doubt it's perfect");
    expect(decodeHtml("<p>i&#x27;d pay for this</p>")).toContain("i'd pay");
    expect(decodeHtml("a &amp;lt; b")).toBe("a &lt; b");
    expect(decodeHtml("<i>x</i>&nbsp;&gt; y")).toBe("x > y");
  });
});
