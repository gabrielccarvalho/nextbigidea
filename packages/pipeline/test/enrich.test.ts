import { describe, expect, it } from "vitest";
// Imported from stages/idea, not stages/enrich: enrich.ts imports `@workspace/db`,
// which throws at import time when DATABASE_URL is unset. parseEnrichedIdea is pure
// and lives in its own module so this test can load without a DB connection.
// Mirrors the dedupe.ts/normalize.ts and themes.ts/cluster.ts splits.
import { parseEnrichedIdea } from "../src/stages/idea";

describe("parseEnrichedIdea", () => {
  it("parses a well-formed Haiku JSON idea and clamps demandScore", () => {
    const raw = `{
      "title": "Stripe Invoice Automator",
      "oneLiner": "Auto-generate branded invoices from Stripe charges.",
      "description": "A tool that watches Stripe and emits invoices.",
      "niche": "fintech-ops",
      "keywords": "invoice stripe automation billing",
      "demandScore": 150,
      "mrrLow": 500,
      "mrrHigh": 4000,
      "competitionNotes": "Some incumbents but gaps in SMB tier.",
      "validationSignals": ["multiple would-pay quotes", "34 comments"]
    }`;
    const idea = parseEnrichedIdea(raw)!;
    expect(idea.title).toBe("Stripe Invoice Automator");
    expect(idea.demandScore).toBe(100); // clamped to 0-100
    expect(idea.mrrLow).toBe(500);
    expect(idea.validationSignals).toContain("34 comments");
  });

  it("returns null when required fields are missing", () => {
    expect(parseEnrichedIdea('{"title": "x"}')).toBeNull();
  });

  it("returns null on non-JSON", () => {
    expect(parseEnrichedIdea("sorry, I cannot")).toBeNull();
  });
});
