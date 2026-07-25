import { describe, expect, it } from "vitest";
import * as content from "./content";
import { COMPANY, PRICING, SOURCES, SPECIMEN } from "./content";

// Recursively collect every string in the content module so a new section
// can't opt out of these rules by being added later.
function allStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, acc));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => allStrings(v, acc));
  }
  return acc;
}

const CORPUS = allStrings(content).join("\n").toLowerCase();

describe("copy rules", () => {
  const BANNED = [
    "powerful",
    "seamless",
    "supercharge",
    "unlock the power",
    "game-changing",
    "revolutionary",
    "cutting-edge",
    "best-in-class",
    "trusted by",
    "loved by",
    "lifetime",
    "forever",
    "weekly cadence",
    // One-time purchase model: subscription language must not reappear anywhere
    // in the copy. "subscri" covers subscribe/subscriber/subscription.
    "subscri",
    "renew",
    "annual",
    "recurring",
    "per year",
    "/year",
  ];

  it.each(BANNED)("does not contain the banned phrase %s", (phrase) => {
    expect(CORPUS).not.toContain(phrase);
  });

  it("never claims new ideas arrive weekly", () => {
    expect(CORPUS).not.toMatch(/new ideas[^.]{0,20}week/);
    expect(CORPUS).not.toMatch(/ideas (every|each) week/);
  });

  it("does not mention unverified sources", () => {
    // reddit/product hunt are forbidden for a stronger reason than the others: their
    // terms prohibit commercial use of the data without written approval, so naming
    // them is a claim we are not licensed to fulfil. See the source audit in
    // docs/ — do not re-add without a signed agreement.
    for (const forbidden of ["linkedin", "twitter", "reddit", "product hunt"]) {
      expect(CORPUS).not.toContain(forbidden);
    }
    // "X" is too short to grep safely; assert the source list instead.
    expect(SOURCES.map((s) => s.name)).toEqual([
      "Hacker News",
      "GitHub",
      "Stack Exchange",
    ]);
  });
});

describe("pricing", () => {
  it("states the price in BRL", () => {
    expect(PRICING.amountBRL).toBe("R$110");
  });

  it("describes the charge as a one-time payment", () => {
    expect(PRICING.paymentModel).toBe("one-time payment");
    expect(CORPUS).toContain("one-time payment");
  });

  it("marks the USD figure as approximate", () => {
    expect(PRICING.amountUSDApprox).toMatch(/^≈/);
  });

  it("never presents a bare USD price anywhere in the copy", () => {
    // A "$20" not preceded by ≈ would read as the actual charge.
    expect(CORPUS).not.toMatch(/(?<!≈)(?<!us)\$20\b/);
  });
});

describe("legal constants", () => {
  it("has every field populated", () => {
    for (const [key, value] of Object.entries(COMPANY)) {
      expect(value, `COMPANY.${key} must not be empty`).toBeTruthy();
      expect(typeof value).toBe("string");
    }
  });

  it("has a well-formed CNPJ", () => {
    expect(COMPANY.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
  });

  it("has a plausible contact email", () => {
    expect(COMPANY.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});

describe("specimen content integrity", () => {
  // These assertions encode a product requirement, not a style preference.
  // The page's central claim is that every number traces back to a post you
  // can go read. The specimen is hand-written, so it must be labelled as an
  // example and must never present a fabricated audit trail.
  it("carries a non-empty example tag", () => {
    expect(SPECIMEN.exampleTag.trim().length).toBeGreaterThan(0);
  });

  it("never attaches a link to an evidence quote", () => {
    for (const row of SPECIMEN.idea.evidence) {
      expect(Object.keys(row).sort()).toEqual(["quote", "source"]);
    }
  });

  it("attributes every quote to a declared source", () => {
    const names = SOURCES.map((s) => s.name);
    for (const row of SPECIMEN.idea.evidence) {
      expect(names).toContain(row.source);
    }
  });

  it("has a demand score inside the documented 0-100 range", () => {
    expect(SPECIMEN.idea.demandScore).toBeGreaterThanOrEqual(0);
    expect(SPECIMEN.idea.demandScore).toBeLessThanOrEqual(100);
  });
});
