import { describe, expect, it } from "vitest";
import { computeNextPeriod } from "./billing-period";

const NOW = new Date("2026-07-20T12:00:00.000Z");

describe("computeNextPeriod", () => {
  it("starts a first subscription at now and ends one year later", () => {
    expect(computeNextPeriod(null, NOW)).toEqual({
      periodStart: NOW,
      periodEnd: new Date("2027-07-20T12:00:00.000Z"),
    });
  });

  // The renewal charge lands a few days BEFORE the current period ends. Starting the new
  // period at `now` would silently burn the remaining days the customer already paid for.
  it("appends to the remaining time when renewing early", () => {
    const currentEnd = new Date("2026-07-25T12:00:00.000Z");
    expect(computeNextPeriod(currentEnd, NOW)).toEqual({
      periodStart: currentEnd,
      periodEnd: new Date("2027-07-25T12:00:00.000Z"),
    });
  });

  it("starts at now when the previous period already lapsed", () => {
    const lapsedEnd = new Date("2026-06-01T12:00:00.000Z");
    expect(computeNextPeriod(lapsedEnd, NOW)).toEqual({
      periodStart: NOW,
      periodEnd: new Date("2027-07-20T12:00:00.000Z"),
    });
  });

  it("starts at now when the previous period ends exactly now", () => {
    expect(computeNextPeriod(new Date(NOW), NOW)).toEqual({
      periodStart: NOW,
      periodEnd: new Date("2027-07-20T12:00:00.000Z"),
    });
  });

  // Feb 29 has no counterpart in a non-leap year. JS rolls forward to Mar 1, which is
  // the behavior we want (never backwards — that would shorten a paid period).
  it("rolls a leap day forward to March 1", () => {
    const leapDay = new Date("2028-02-29T12:00:00.000Z");
    expect(computeNextPeriod(null, leapDay).periodEnd).toEqual(
      new Date("2029-03-01T12:00:00.000Z"),
    );
  });

  it("does not mutate its inputs", () => {
    const end = new Date("2026-07-25T12:00:00.000Z");
    const snapshot = end.getTime();
    computeNextPeriod(end, NOW);
    expect(end.getTime()).toBe(snapshot);
  });
});
