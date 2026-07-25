import { SOURCES } from "./content";

// "$2–6k" — the compact money-range format the landing page specimen promises.
// Values under $1k render whole ("$450–900"); thousands get a k suffix with at
// most one decimal ("$1.5–12k"); when both ends carry the suffix it collapses
// onto the high end, matching the specimen's "$2–6k".
export function formatMoneyRange(low: number, high: number): string {
  if (low === high) return `$${compact(low)}${low >= 1000 ? "k" : ""}`;
  if (low >= 1000 && high >= 1000) return `$${compact(low)}–${compact(high)}k`;
  const side = (n: number) => `${compact(n)}${n >= 1000 ? "k" : ""}`;
  return `$${side(low)}–${side(high)}`;
}

// Numeric part only — the caller decides whether a k suffix applies.
function compact(n: number): string {
  if (n < 1000) return String(n);
  return String(Math.round((n / 1000) * 10) / 10);
}

// Pipeline adapters store lowercase slugs on raw posts; marketing copy knows
// sources by display name and brand color (SOURCES in content.ts). Unknown
// slugs — sources we are not licensed to market — fall back to a neutral
// capitalized label with no brand color.
const SLUG_TO_NAME: Record<string, (typeof SOURCES)[number]["name"]> = {
  hackernews: "Hacker News",
  github: "GitHub",
  stackexchange: "Stack Exchange",
};

export function sourceDisplay(slug: string): { name: string; color: string | undefined } {
  const name = SLUG_TO_NAME[slug];
  if (name) return { name, color: SOURCES.find((s) => s.name === name)?.color };
  return { name: slug.charAt(0).toUpperCase() + slug.slice(1), color: undefined };
}
