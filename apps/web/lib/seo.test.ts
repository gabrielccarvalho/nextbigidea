import { describe, expect, it } from "vitest";
import { clampDescription, lockedIdeaDescription, MAX_DESCRIPTION } from "./seo";

describe("clampDescription", () => {
  it("leaves copy inside the budget untouched", () => {
    const short = "A native Visual Studio integration layer for AI coding agents.";
    expect(clampDescription(short)).toBe(short);
  });

  it("collapses whitespace so wrapped model output reads as one line", () => {
    expect(clampDescription("teams   using\n  open-source\tpackages")).toBe(
      "teams using open-source packages",
    );
  });

  it("clamps to the budget and never cuts mid-word", () => {
    const long =
      "Small-to-mid-sized software teams using open-source packages, PyPI and npm ecosystems, developer utilities, and AI infrastructure without a dedicated supply-chain security program.";
    const out = clampDescription(long);

    expect(out.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(out.endsWith("…")).toBe(true);
    // The character before the ellipsis belongs to a word the source contains
    // in full — i.e. the cut landed on a boundary, not inside a token.
    expect(long).toContain(out.slice(0, -1).split(" ").pop());
  });

  it("does not leave dangling punctuation in front of the ellipsis", () => {
    const out = clampDescription(`${"word ".repeat(30)}trailing, more words here`);
    expect(out).not.toMatch(/[,;:.–—-]…$/);
  });

  it("still clamps a single pathologically long token", () => {
    const out = clampDescription("x".repeat(400));
    expect(out.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
  });
});

describe("lockedIdeaDescription", () => {
  const LONGEST_REAL_NICHE =
    "Small-to-mid-sized software teams using open-source packages, PyPI/npm ecosystems, developer utilities, and AI/LLM infrastructure without a dedicated supply-chain security program.";

  it("keeps the whole thing inside the budget even for the longest niche", () => {
    expect(lockedIdeaDescription(LONGEST_REAL_NICHE).length).toBeLessThanOrEqual(MAX_DESCRIPTION);
  });

  it("joins cleanly onto the suffix with no dangling punctuation", () => {
    expect(lockedIdeaDescription(LONGEST_REAL_NICHE)).toMatch(
      /[a-zA-Z0-9] — scored demand evidence, with the source posts behind it\.$/,
    );
  });

  it("passes a short niche through in full", () => {
    expect(lockedIdeaDescription("Indie iOS developers")).toBe(
      "Indie iOS developers — scored demand evidence, with the source posts behind it.",
    );
  });

  // The whole point of the locked variant: it is built from `niche` alone, so
  // no paid field can reach a meta tag by way of this helper.
  it("reveals nothing beyond the niche it was given", () => {
    const out = lockedIdeaDescription("Indie iOS developers");
    for (const paid of ["94", "47", "$2", "MRR", "competition"]) {
      expect(out).not.toContain(paid);
    }
  });
});
