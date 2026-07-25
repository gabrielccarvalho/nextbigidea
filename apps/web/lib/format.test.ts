import { describe, expect, it } from "vitest";
import { formatMoneyRange, sourceDisplay } from "./format";
import { SOURCES } from "./content";

describe("formatMoneyRange", () => {
  it("collapses the k suffix when both ends are thousands, like the specimen", () => {
    expect(formatMoneyRange(2000, 6000)).toBe("$2–6k");
  });

  it("keeps one decimal for non-round thousands", () => {
    expect(formatMoneyRange(1500, 12000)).toBe("$1.5–12k");
  });

  it("renders sub-thousand ranges without a suffix", () => {
    expect(formatMoneyRange(450, 900)).toBe("$450–900");
  });

  it("mixes suffixes when only the high end is in the thousands", () => {
    expect(formatMoneyRange(800, 1200)).toBe("$800–1.2k");
  });

  it("renders a single value when both ends are equal", () => {
    expect(formatMoneyRange(2000, 2000)).toBe("$2k");
    expect(formatMoneyRange(0, 0)).toBe("$0");
  });

  it("never emits a trailing .0", () => {
    expect(formatMoneyRange(1000, 3000)).toBe("$1–3k");
  });
});

describe("sourceDisplay", () => {
  it("maps every pipeline slug for a marketed source to its display name and color", () => {
    expect(sourceDisplay("hackernews")).toEqual({ name: "Hacker News", color: "#ff6600" });
    expect(sourceDisplay("github")).toEqual({ name: "GitHub", color: "#8957e5" });
    expect(sourceDisplay("stackexchange")).toEqual({ name: "Stack Exchange", color: "#0a95ff" });
  });

  it("covers all three marketed sources", () => {
    for (const s of SOURCES) {
      const hit = ["hackernews", "github", "stackexchange"].some(
        (slug) => sourceDisplay(slug).name === s.name,
      );
      expect(hit, `${s.name} must be reachable from a pipeline slug`).toBe(true);
    }
  });

  it("falls back to a capitalized slug with no color for unknown sources", () => {
    expect(sourceDisplay("reddit")).toEqual({ name: "Reddit", color: undefined });
  });
});
