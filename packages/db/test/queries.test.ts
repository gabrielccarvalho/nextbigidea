import { describe, expect, it } from "vitest";
import { orderIdeasForListing } from "../src/ordering";
import type { Idea } from "../src/index";

function idea(over: Partial<Idea>): Idea {
  return {
    id: 1, slug: "s", title: "t", oneLiner: "o", description: "d", niche: "n",
    keywords: "", demandScore: 0, mrrLow: 0, mrrHigh: 0, competitionNotes: "",
    validationSignals: [], askCount: 0, status: "published", isFree: false,
    createdAt: new Date(0), publishedAt: new Date(0), ...over,
  } as Idea;
}

describe("orderIdeasForListing", () => {
  it("puts free ideas first, then higher demandScore first", () => {
    const out = orderIdeasForListing([
      idea({ id: 1, isFree: false, demandScore: 90 }),
      idea({ id: 2, isFree: true, demandScore: 10 }),
      idea({ id: 3, isFree: false, demandScore: 95 }),
    ]);
    expect(out.map((i) => i.id)).toEqual([2, 3, 1]);
  });
});
