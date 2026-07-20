import { describe, expect, it } from "vitest";
import { computeAccess } from "./access";

const NOW = new Date("2026-07-20T12:00:00.000Z");

describe("computeAccess", () => {
  it("grants access while the paid period is still running", () => {
    const periodEnd = new Date("2027-07-20T12:00:00.000Z");
    expect(computeAccess(periodEnd, NOW)).toEqual({ hasFullAccess: true, periodEnd });
  });

  it("denies access once the period has ended", () => {
    const periodEnd = new Date("2026-07-19T12:00:00.000Z");
    expect(computeAccess(periodEnd, NOW)).toEqual({ hasFullAccess: false, periodEnd });
  });

  // Boundary: the period is exclusive at its end. A subscription that ends exactly now
  // is over. Getting this backwards grants a free extra tick of access on every renewal.
  it("denies access at the exact instant the period ends", () => {
    const periodEnd = new Date(NOW);
    expect(computeAccess(periodEnd, NOW)).toEqual({ hasFullAccess: false, periodEnd });
  });

  it("denies access when there is no paid period at all", () => {
    expect(computeAccess(null, NOW)).toEqual({ hasFullAccess: false, periodEnd: null });
  });
});
