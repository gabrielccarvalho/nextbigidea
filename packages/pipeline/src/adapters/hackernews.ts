import type { AdapterDeps, PipelineEnv, RawPost, SourceAdapter } from "../types";

// Demand phrasing lives in COMMENTS, not stories. Measured against Algolia over a
// 7-day window: `tags=ask_hn` returned 0 hits for every one of these phrases, while
// `tags=comment` returned 27. The old adapter queried "ask HN tool" with tags=ask_hn,
// fetched 27 generic Ask HN posts, and 0 of them survived the keyword prefilter — the
// fetch half and the filter half were looking in different places.
//
// One query per phrase rather than one broad query: Algolia's relevance search over a
// vague term ("ask HN tool") returns topically-adjacent posts, whereas a quoted phrase
// matches the literal demand expression the prefilter is also looking for.
// Exported: the Stack Exchange and GitHub adapters search the same quoted
// phrases, so all sources mine one shared definition of "demand phrasing".
export const DEMAND_PHRASES = [
  '"i wish there was"',
  '"i wish someone would"',
  '"is there a tool"',
  '"is there an app"',
  '"looking for a tool"',
  '"does anyone know of"',
  '"would pay for"',
  '"someone should build"',
  '"there is no good"',
  '"why is there no"',
];

interface HnHit {
  objectID?: string;
  // Story hits carry title/story_text; comment hits carry comment_text + story_title.
  title?: string;
  story_text?: string | null;
  comment_text?: string | null;
  story_title?: string | null;
  story_id?: number;
  author?: string;
  points?: number | null;
  num_comments?: number | null;
  created_at_i?: number;
}

// Algolia returns comment bodies as HTML: entity-escaped text with <p> and <a> tags.
// This is not cosmetic. The relevance prefilter matches /\b(would pay|i'd pay)\b/i,
// and an apostrophe arrives as `&#x27;` — so "i'd pay" in a real comment reads as
// "i&#x27;d pay" and the pattern silently never fires. Decoding must happen before
// any downstream text matching.
export function decodeHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    // &amp; last, so "&amp;lt;" decodes to "&lt;" rather than "<".
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function parseHnHits(json: unknown): RawPost[] {
  const hits = (json as { hits?: HnHit[] })?.hits;
  if (!Array.isArray(hits)) return [];
  const out: RawPost[] = [];
  for (const h of hits) {
    if (!h.objectID) continue;
    const isComment = typeof h.comment_text === "string" && h.comment_text.length > 0;
    const body = isComment ? h.comment_text! : (h.story_text ?? "");
    const content = decodeHtml(body);
    const title = isComment ? (h.story_title ?? undefined) : h.title;
    // Drop only when BOTH are empty. A story can carry its whole demand in the title
    // ("Ask HN: best transcription tool?") with story_text null, and the relevance
    // prefilter reads `${title} ${content}` — so title-only hits are still evaluable.
    if (!content && !title) continue;
    out.push({
      source: "hackernews",
      sourcePostId: h.objectID,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: h.author,
      // For a comment the story title is context, not the comment's own claim, but it
      // helps the clusterer group comments from the same discussion.
      title,
      content,
      postedAt: h.created_at_i ? new Date(h.created_at_i * 1000) : undefined,
      // Comment hits carry NO points and NO num_comments — both come back absent, so
      // these are 0 for every comment. Do NOT add a synthetic ranking figure here:
      // topByEngagement() SUMS metric values, so anything on a larger scale than
      // points (a timestamp, say) would swamp them and silently become the only
      // ranking signal. Comment ordering is handled by that function's postedAt
      // tiebreak instead, and these metrics stay an honest record of what HN reported.
      metrics: { points: h.points ?? 0, comments: h.num_comments ?? 0 },
    });
  }
  return out;
}

// Algolia caps any single query at 1,000 retrievable hits no matter how it is
// paged (verified live: offset 1,000+ returns "you can only fetch the 1000 hits
// for this query"). The way past the cap is to slice TIME, not pages: fetch the
// newest window, then re-issue the query bounded below the oldest hit seen, and
// repeat. Each window yields up to hitsPerPage hits; chaining windows walks
// arbitrarily far back. maxPages bounds the walk so one fat phrase over a long
// backfill window cannot fetch unbounded input for the paid classifier.
//
// Boundary note: `created_at_i<oldest` excludes other comments posted in that
// same second — an acceptable loss versus re-fetching the whole page to dedupe.
export async function walkPhrase(
  phrase: string,
  sinceTs: number,
  fetchImpl: typeof fetch,
  opts: { hitsPerPage: number; maxPages: number },
): Promise<RawPost[]> {
  const all: RawPost[] = [];
  let upperTs: number | undefined;
  for (let pageNo = 0; pageNo < opts.maxPages; pageNo++) {
    const window = `created_at_i>${sinceTs}` + (upperTs !== undefined ? `,created_at_i<${upperTs}` : "");
    const url =
      `https://hn.algolia.com/api/v1/search_by_date` +
      `?query=${encodeURIComponent(phrase)}&tags=comment` +
      `&numericFilters=${encodeURIComponent(window)}&hitsPerPage=${opts.hitsPerPage}`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { hits?: { created_at_i?: number }[] };
    all.push(...parseHnHits(json));
    const hits = Array.isArray(json?.hits) ? json.hits : [];
    if (hits.length < opts.hitsPerPage) break;
    const stamps = hits.map((h) => h.created_at_i).filter((t): t is number => typeof t === "number");
    if (stamps.length === 0) break;
    upperTs = Math.min(...stamps);
  }
  return all;
}

// 10,000 requests/hour per IP (Algolia's published limit); even a full backfill
// walk is 10 phrases × MAX_PAGES_PER_PHRASE requests — nowhere near it.
const HITS_PER_PAGE = 1000;
const MAX_PAGES_PER_PHRASE = 2;

export const hackerNewsAdapter: SourceAdapter = {
  name: "hackernews",
  enabled: (env) => env.sources.hackernews,
  async fetchPosts(since: Date, _env: PipelineEnv, deps: AdapterDeps = {}): Promise<RawPost[]> {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const sinceTs = Math.floor(since.getTime() / 1000);
    const all: RawPost[] = [];
    const errors: string[] = [];
    for (const phrase of DEMAND_PHRASES) {
      try {
        all.push(
          ...(await walkPhrase(phrase, sinceTs, fetchImpl, {
            hitsPerPage: HITS_PER_PAGE,
            maxPages: MAX_PAGES_PER_PHRASE,
          })),
        );
      } catch (err) {
        // One phrase failing must not lose the other nine. Only a total wipeout is
        // reported as an adapter failure.
        errors.push(`${phrase}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (all.length === 0 && errors.length > 0) {
      throw new Error(`hn: all ${errors.length} queries failed — ${errors[0]}`);
    }
    return all;
  },
};
