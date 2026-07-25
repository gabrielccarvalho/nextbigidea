// Pure: no DB, no next/navigation. Pagination is URL-driven (?page=N) so any
// page of the list is shareable and reloadable; these helpers turn the raw
// query param into a safe page number and a compact page-link window.

export const IDEAS_PER_PAGE = 20;

// Raw query param → page number. Anything unparsable is page 1; out-of-range
// values clamp instead of 404ing, so a stale shared link still lands on real
// content after the list shrinks.
export function clampPage(raw: string | undefined, totalPages: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), Math.max(totalPages, 1));
}

// Page numbers to render: first, last, and the current page ±1, with "…" gaps.
// Keeps the nav one line tall no matter how many pages exist.
export function pageWindow(current: number, total: number): (number | "…")[] {
  const wanted = new Set(
    [1, current - 1, current, current + 1, total].filter((p) => p >= 1 && p <= total),
  );
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of [...wanted].sort((a, b) => a - b)) {
    if (prev !== 0 && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}
