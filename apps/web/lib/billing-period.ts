// Pure: no DB import (see access.ts for why that matters for the test run).
//
// AbacatePay's subscription object exposes no `nextBilling` or period-end field — only
// createdAt/updatedAt/status/frequency/retryPolicy — so the access window is computed here.

/**
 * Adds one calendar year. Feb 29 has no counterpart in a non-leap year; JS rolls it
 * forward to Mar 1, which is what we want — rolling backwards would shorten a period
 * the customer already paid for.
 */
export function addOneYear(date: Date): Date {
  const next = new Date(date.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

/**
 * The stacking rule. A renewal that arrives before the current period expires must APPEND
 * a year to the remaining time, not restart from now — otherwise every early renewal
 * silently discards the days already paid for.
 *
 * @param latestPeriodEnd the furthest `period_end` across the user's paid rows, or null
 * @param now             injected clock
 */
export function computeNextPeriod(
  latestPeriodEnd: Date | null,
  now: Date,
): { periodStart: Date; periodEnd: Date } {
  const stillRunning = latestPeriodEnd !== null && latestPeriodEnd.getTime() > now.getTime();
  const periodStart = stillRunning ? new Date(latestPeriodEnd.getTime()) : new Date(now.getTime());
  return { periodStart, periodEnd: addOneYear(periodStart) };
}

/** A paid access window. `id` is opaque here — the route maps it back to a purchases row. */
export interface IdentifiedPeriod {
  id: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * The refund rule.
 *
 * Access is `MAX(period_end)` over a user's paid rows, and `computeNextPeriod` STACKS: each new
 * period begins exactly where the furthest existing one ended. That makes a refund of an *earlier*
 * charge a no-op on its own — flipping it to `refunded` drops it from the access query, but the
 * row stacked on top of it still ends at the same far-future date, so the customer loses nothing.
 *
 * Correct semantic: the refunded year stops counting, and everything stacked ON TOP of it slides
 * back by exactly that year. Rows A (2026→2027) and B (2027→2028), refunding A leaves B as
 * 2026→2027 — the customer keeps the one year they actually paid for.
 *
 * Only the CONTIGUOUS chain resting on the refunded row moves. A later, unrelated purchase made
 * after a lapse in coverage does not begin at the refunded row's `period_end`, so it is not
 * standing on it and must not be dragged backwards. Rows entirely before the refunded one are
 * likewise untouched. Contiguity is exact-instant equality because that is precisely how
 * `computeNextPeriod` builds a stack.
 *
 * The chain is RE-ANCHORED calendrically rather than slid back by a fixed number of milliseconds.
 * Every period in this system is exactly `addOneYear` long, and a fixed-millisecond shift is not:
 * subtracting 365 days from a period that spans a leap year lands a day off, and the error
 * compounds down a long chain. Re-anchoring keeps every row exactly one calendar year, which is
 * the invariant `computeNextPeriod` established when it built the stack.
 *
 * Pure: no clock needed (the result is relative to the refunded row), inputs are never mutated,
 * and only the rows that actually change are returned.
 *
 * @param refunded          the period of the row being refunded
 * @param otherPaidPeriods  the user's OTHER paid rows (the refunded row itself excluded)
 * @returns the subset of `otherPaidPeriods` that must be rewritten, with their new periods
 */
export function computeRefundStackShift(
  refunded: { periodStart: Date; periodEnd: Date },
  otherPaidPeriods: readonly IdentifiedPeriod[],
): IdentifiedPeriod[] {
  if (refunded.periodEnd.getTime() <= refunded.periodStart.getTime()) return [];

  // Copy before sorting — `Array.prototype.sort` mutates, and the caller's array is not ours.
  const ascending = [...otherPaidPeriods].sort(
    (a, b) => a.periodStart.getTime() - b.periodStart.getTime(),
  );

  const shifted: IdentifiedPeriod[] = [];
  // Two cursors: `chainEnd` walks the ORIGINAL periods to decide what is resting on what, while
  // `newStart` builds the re-anchored replacement chain starting where the refunded row began.
  let chainEnd = refunded.periodEnd.getTime();
  let newStart = new Date(refunded.periodStart.getTime());
  for (const row of ascending) {
    if (row.periodStart.getTime() !== chainEnd) continue; // not resting on the chain — leave alone
    chainEnd = row.periodEnd.getTime();
    const periodEnd = addOneYear(newStart);
    shifted.push({ id: row.id, periodStart: newStart, periodEnd });
    newStart = periodEnd;
  }
  return shifted;
}
