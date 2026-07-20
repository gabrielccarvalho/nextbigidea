import { describe, expect, it } from "vitest";
import { slugify, parseThemes } from "../src/stages/themes";

describe("slugify", () => {
  it("lowercases, strips punctuation, and hyphenates", () => {
    expect(slugify("Auto-Invoice Generator for Stripe!")).toBe("auto-invoice-generator-for-stripe");
  });
  it("collapses whitespace and trims hyphens", () => {
    expect(slugify("  Two   Words  ")).toBe("two-words");
  });
});

describe("parseThemes", () => {
  it("extracts theme objects from a JSON block in Haiku output", () => {
    const raw =
      'Here are the themes:\n[{"title":"Invoice automation","postKeys":["reddit:a","hackernews:b"]},{"title":"Pricing tracker","postKeys":["reddit:c"]}]';
    const themes = parseThemes(raw);
    expect(themes).toHaveLength(2);
    expect(themes[0]).toEqual({ title: "Invoice automation", postKeys: ["reddit:a", "hackernews:b"] });
  });
  it("returns [] when no JSON array is present", () => {
    expect(parseThemes("no themes found")).toEqual([]);
  });
});
