import { describe, expect, it } from "vitest";
import * as content from "./content";
import { COMPANY, PRICING, SOURCES, SPECIMEN } from "./content";
// Safe to import here: provider.ts is deliberately free of `@workspace/db` and every
// other impure import, so pulling it in costs no database connection. See its header.
import { PRICE_CENTS } from "./payments/provider";

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
  it("states the price in USD", () => {
    expect(PRICING.amount).toBe("$20");
  });

  it("describes the charge as a one-time payment", () => {
    expect(PRICING.paymentModel).toBe("one-time payment");
    expect(CORPUS).toContain("one-time payment");
  });

  it("never quotes a BRL price anywhere in the copy", () => {
    // Stripe charges in USD (see lib/payments/stripe.ts). A leftover "R$110" would
    // quote a price we no longer charge — the exact defect this suite exists to catch.
    // Also covers the "≈US$20" approximation marker, which only made sense while the
    // real charge was in another currency.
    expect(CORPUS).not.toContain("r$");
    expect(CORPUS).not.toContain("≈");
  });

  it("quotes the price the checkout actually charges", () => {
    // PRICE_CENTS is the amount recorded on the purchase row; PRICING.amount is what
    // the marketing copy promises. These drifting apart is a money bug, so pin them
    // together here rather than trusting two constants to be edited in step.
    expect(PRICING.amount).toBe(`$${PRICE_CENTS / 100}`);
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
