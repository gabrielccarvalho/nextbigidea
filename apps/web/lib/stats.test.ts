import { describe, expect, it } from "vitest";
import { applyStatsFloor, STATS_FLOOR } from "./stats";

describe("applyStatsFloor", () => {
  const healthy = { ideasPublished: 120, postsScanned: 40_000, postsLastWeek: 2_100 };

  it("returns the stats with a fixed source count when above the floor", () => {
    expect(applyStatsFloor(healthy)).toEqual({ ...healthy, sources: 3 });
  });

  it("returns null when too few ideas are published", () => {
    expect(
      applyStatsFloor({ ...healthy, ideasPublished: STATS_FLOOR.ideasPublished - 1 }),
    ).toBeNull();
  });

  it("returns null when too few posts have been scanned", () => {
    expect(
      applyStatsFloor({ ...healthy, postsScanned: STATS_FLOOR.postsScanned - 1 }),
    ).toBeNull();
  });

  it("renders at exactly the floor", () => {
    const atFloor = {
      ideasPublished: STATS_FLOOR.ideasPublished,
      postsScanned: STATS_FLOOR.postsScanned,
      postsLastWeek: 0,
    };
    expect(applyStatsFloor(atFloor)).not.toBeNull();
  });

  it("reports three sources regardless of what the database contains", () => {
    // Guards the trust rule: a stray best-effort X/LinkedIn row must never
    // cause the page to start claiming more sources than we actually cover.
    expect(applyStatsFloor(healthy)?.sources).toBe(3);
  });

  it("allows zero posts in the last week without hiding the section", () => {
    // The pipeline runs weekly; a missed run must not blank the proof bar.
    expect(applyStatsFloor({ ...healthy, postsLastWeek: 0 })).not.toBeNull();
  });
});
