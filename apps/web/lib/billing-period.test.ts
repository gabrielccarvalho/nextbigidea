import { describe, expect, it } from "vitest";
import { computeNextPeriod, computeRefundStackShift } from "./billing-period";

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

describe("computeRefundStackShift", () => {
  const d = (iso: string) => new Date(iso);

  // A stack built exactly the way computeNextPeriod builds one: each period starts where the
  // previous ended. A = the original purchase, B = the renewal stacked on top of it.
  const A = { periodStart: d("2026-01-01T00:00:00.000Z"), periodEnd: d("2027-01-01T00:00:00.000Z") };
  const B = {
    id: 2,
    periodStart: d("2027-01-01T00:00:00.000Z"),
    periodEnd: d("2028-01-01T00:00:00.000Z"),
  };

  it("shifts nothing when the refunded row is the only one", () => {
    expect(computeRefundStackShift(A, [])).toEqual([]);
  });

  // The whole point of the fix: without this, refunding A leaves B still ending in 2028 and the
  // refund revokes nothing at all.
  it("slides the later row back when the earliest of a stack is refunded", () => {
    expect(computeRefundStackShift(A, [B])).toEqual([
      {
        id: 2,
        periodStart: d("2026-01-01T00:00:00.000Z"),
        periodEnd: d("2027-01-01T00:00:00.000Z"),
      },
    ]);
  });

  it("shifts nothing when the latest of a stack is refunded", () => {
    // Refunding B: A sits BELOW it, so nothing is resting on B.
    const a = { id: 1, ...A };
    expect(computeRefundStackShift(B, [a])).toEqual([]);
  });

  it("leaves a later purchase that is not resting on the refunded row alone", () => {
    // C was bought after coverage lapsed, so it does not begin at A's period_end. It stands on
    // its own money and must not be dragged backwards.
    const C = {
      id: 3,
      periodStart: d("2030-06-01T00:00:00.000Z"),
      periodEnd: d("2031-06-01T00:00:00.000Z"),
    };
    expect(computeRefundStackShift(A, [C])).toEqual([]);
  });

  it("slides an entire multi-row chain back by one period", () => {
    const c = {
      id: 3,
      periodStart: d("2028-01-01T00:00:00.000Z"),
      periodEnd: d("2029-01-01T00:00:00.000Z"),
    };
    // Deliberately out of order to prove the function sorts rather than trusting input order.
    expect(computeRefundStackShift(A, [c, B])).toEqual([
      {
        id: 2,
        periodStart: d("2026-01-01T00:00:00.000Z"),
        periodEnd: d("2027-01-01T00:00:00.000Z"),
      },
      {
        id: 3,
        periodStart: d("2027-01-01T00:00:00.000Z"),
        periodEnd: d("2028-01-01T00:00:00.000Z"),
      },
    ]);
  });

  // Regression: a fixed-millisecond shift drifts a day whenever the chain crosses a leap year
  // (2028 has 366). The chain must be re-anchored calendrically so every row stays exactly one
  // year, matching how computeNextPeriod built it.
  it("keeps every shifted row exactly one calendar year across a leap year", () => {
    const c = {
      id: 3,
      periodStart: d("2028-01-01T00:00:00.000Z"),
      periodEnd: d("2029-01-01T00:00:00.000Z"),
    };
    const out = computeRefundStackShift(A, [B, c]);
    expect(out[1]).toEqual({
      id: 3,
      periodStart: d("2027-01-01T00:00:00.000Z"),
      periodEnd: d("2028-01-01T00:00:00.000Z"),
    });
  });

  it("stops at the first gap in the chain", () => {
    const gapped = {
      id: 4,
      periodStart: d("2028-03-01T00:00:00.000Z"), // two months after B ends — chain is broken
      periodEnd: d("2029-03-01T00:00:00.000Z"),
    };
    const out = computeRefundStackShift(A, [B, gapped]);
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  it("ignores rows that sit entirely before the refunded row", () => {
    const earlier = {
      id: 9,
      periodStart: d("2025-01-01T00:00:00.000Z"),
      periodEnd: d("2026-01-01T00:00:00.000Z"),
    };
    expect(computeRefundStackShift(A, [earlier])).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const others = [B];
    const snapshot = { start: B.periodStart.getTime(), end: B.periodEnd.getTime() };
    computeRefundStackShift(A, others);
    expect(others).toHaveLength(1);
    expect(others[0]).toBe(B);
    expect(B.periodStart.getTime()).toBe(snapshot.start);
    expect(B.periodEnd.getTime()).toBe(snapshot.end);
    expect(A.periodStart.getTime()).toBe(d("2026-01-01T00:00:00.000Z").getTime());
  });
});
