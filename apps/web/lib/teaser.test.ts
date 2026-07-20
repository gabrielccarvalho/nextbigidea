import { describe, expect, it } from "vitest";
import { toTeaserIdea } from "./teaser";
import type { Idea } from "@workspace/db";

describe("toTeaserIdea", () => {
  it("returns an object with exactly the keys title and niche", () => {
    const full = {
      id: 1,
      title: "Full idea",
      niche: "Devtools",
      description: "sensitive description",
      demandScore: 42,
      mrrLow: 1000,
      mrrHigh: 5000,
      competitionNotes: "sensitive notes",
      validationSignals: "sensitive signals",
      askCount: 7,
      keywords: ["a", "b"],
      slug: "full-idea",
      status: "published",
      isFree: false,
      createdAt: new Date(),
      publishedAt: new Date(),
    } as unknown as Idea;

    const teaser = toTeaserIdea(full);

    expect(Object.keys(teaser).sort()).toEqual(["niche", "title"]);
  });
});
