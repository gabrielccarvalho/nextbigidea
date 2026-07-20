import { describe, expect, it } from "vitest";
import * as content from "./content";
import { COMPANY, PRICING, SOURCES } from "./content";

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
  ];

  it.each(BANNED)("does not contain the banned phrase %s", (phrase) => {
    expect(CORPUS).not.toContain(phrase);
  });

  it("never claims new ideas arrive weekly", () => {
    expect(CORPUS).not.toMatch(/new ideas[^.]{0,20}week/);
    expect(CORPUS).not.toMatch(/ideas (every|each) week/);
  });

  it("does not mention unverified sources", () => {
    for (const forbidden of ["linkedin", "twitter"]) {
      expect(CORPUS).not.toContain(forbidden);
    }
    // "X" is too short to grep safely; assert the source list instead.
    expect(SOURCES.map((s) => s.name)).toEqual([
      "Reddit",
      "Hacker News",
      "Product Hunt",
    ]);
  });
});

describe("pricing", () => {
  it("states the price in BRL", () => {
    expect(PRICING.amountBRL).toBe("R$110");
    expect(PRICING.term).toBe("year");
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
