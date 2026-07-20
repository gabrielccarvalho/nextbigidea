import type { RawPost } from "../types";

// Drops duplicate (source, sourcePostId) pairs within a batch, keeping the
// FIRST occurrence. Keys must match the raw_posts unique index exactly.
export function dedupeInMemory(posts: RawPost[]): RawPost[] {
  const seen = new Set<string>();
  const out: RawPost[] = [];
  for (const p of posts) {
    const key = `${p.source}:${p.sourcePostId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
