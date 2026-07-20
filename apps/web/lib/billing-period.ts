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
