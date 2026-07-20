// Pure helpers for the clustering stage. Deliberately free of any `@workspace/db`
// import: that package throws at import time when DATABASE_URL is unset, which
// would otherwise force a fake connection string into the test environment.
// Mirrors the dedupe.ts / normalize.ts split from Task 7.

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseThemes(text: string): { title: string; postKeys: string[] }[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t) => t && typeof t.title === "string" && Array.isArray(t.postKeys))
      .map((t) => ({ title: t.title as string, postKeys: t.postKeys as string[] }));
  } catch {
    return [];
  }
}
