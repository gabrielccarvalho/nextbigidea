// Pure spend-cap arithmetic. Deliberately free of any `@workspace/db` import:
// that package throws at import time when DATABASE_URL is unset, which would
// otherwise force a fake connection string into the test environment.
// Mirrors the dedupe.ts / themes.ts / idea.ts split elsewhere in this package.

// The cap is "monthly" (trailing 30 days), not per-run. Callers must add
// spend already recorded by prior runs in the window to the current run's
// in-flight spend before comparing against the cap — comparing the current
// run's spend alone (the old behavior) lets a weekly cron spend up to
// capMillicents on every single run, ~4.3x the stated budget per month.
export function isOverCap(
  alreadySpentMillicents: number,
  runSpentMillicents: number,
  capMillicents: number,
): boolean {
  return alreadySpentMillicents + runSpentMillicents >= capMillicents;
}
