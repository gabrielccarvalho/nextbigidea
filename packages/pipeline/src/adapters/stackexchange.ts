import type { AdapterDeps, PipelineEnv, RawPost, SourceAdapter } from "../types";
import { DEMAND_PHRASES, decodeHtml } from "./hackernews";

// Verified against the live API (2026-07): /search/advanced does literal matching
// for quoted phrases, `filter=withbody` returns bodies in the same response, and
// commercial use of the content is licensed (CC BY-SA — attribution required when
// an excerpt is shown publicly, which is why author + link are captured here).
// Quota: 300 req/day keyless, 10,000 with a free stackapps key; the API's
// `backoff` field is strictly enforced and honoured below.
//
// Site choice: softwarerecs is wall-to-wall demand ("recommend me a tool for X");
// the rest are high-volume tooling/pain-point sites. Quota math at 10 phrases:
// 6 sites × 10 phrases = 60 requests per run, fine even keyless.
export const SE_SITES = ["softwarerecs", "superuser", "webapps", "askubuntu", "apple", "android"];

interface SeItem {
  question_id?: number;
  title?: string;
  body?: string;
  link?: string;
  owner?: { display_name?: string };
  score?: number;
  answer_count?: number;
  creation_date?: number;
}

export function parseSeItems(json: unknown, site: string): RawPost[] {
  const items = (json as { items?: SeItem[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: RawPost[] = [];
  for (const it of items) {
    if (typeof it.question_id !== "number") continue;
    // Titles arrive entity-escaped and bodies as full HTML — same trap as HN:
    // "i'd pay" reads "i&#39;d pay" and the relevance prefilter never fires.
    const title = it.title ? decodeHtml(it.title) : undefined;
    const content = it.body ? decodeHtml(it.body) : "";
    if (!content && !title) continue;
    out.push({
      source: "stackexchange",
      // question_id is only unique within one site.
      sourcePostId: `${site}-${it.question_id}`,
      url: it.link ?? `https://${site}.stackexchange.com/q/${it.question_id}`,
      author: it.owner?.display_name,
      title,
      content,
      postedAt: it.creation_date ? new Date(it.creation_date * 1000) : undefined,
      metrics: { score: it.score ?? 0, answers: it.answer_count ?? 0 },
    });
  }
  return out;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const stackExchangeAdapter: SourceAdapter = {
  name: "stackexchange",
  enabled: (env) => env.sources.stackexchange,
  async fetchPosts(since: Date, env: PipelineEnv, deps: AdapterDeps = {}): Promise<RawPost[]> {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const sleep = deps.sleep ?? defaultSleep;
    const sinceTs = Math.floor(since.getTime() / 1000);
    const key = env.stackexchangeKey ? `&key=${encodeURIComponent(env.stackexchangeKey)}` : "";
    const all: RawPost[] = [];
    const errors: string[] = [];
    for (const site of SE_SITES) {
      for (const phrase of DEMAND_PHRASES) {
        const url =
          `https://api.stackexchange.com/2.3/search/advanced` +
          `?site=${site}&q=${encodeURIComponent(phrase)}` +
          `&filter=withbody&sort=creation&order=desc` +
          `&fromdate=${sinceTs}&pagesize=100${key}`;
        try {
          const res = await fetchImpl(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as { backoff?: number };
          all.push(...parseSeItems(json, site));
          // `backoff` is seconds and strictly enforced — ignoring it earns a
          // temporary IP ban, so it must delay the NEXT request.
          if (typeof json.backoff === "number" && json.backoff > 0) {
            await sleep(json.backoff * 1000);
          }
        } catch (err) {
          // One site/phrase failing must not lose the rest. Only a total
          // wipeout is reported as an adapter failure.
          errors.push(`${site}/${phrase}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    // softwarerecs harvest: on that site every question IS a tool request, so
    // phrase search under-collects badly ("Software to batch-rename photos?"
    // contains no demand phrase). Pull the whole window instead; the loosest
    // SIGNAL_PATTERNS regex and the paid classifier do the filtering.
    for (let page = 1; page <= 3; page++) {
      const url =
        `https://api.stackexchange.com/2.3/questions` +
        `?site=softwarerecs&filter=withbody&sort=creation&order=desc` +
        `&fromdate=${sinceTs}&pagesize=100&page=${page}${key}`;
      try {
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { backoff?: number; has_more?: boolean };
        all.push(...parseSeItems(json, "softwarerecs"));
        if (typeof json.backoff === "number" && json.backoff > 0) {
          await sleep(json.backoff * 1000);
        }
        if (!json.has_more) break;
      } catch (err) {
        errors.push(`softwarerecs/harvest p${page}: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
    }
    if (all.length === 0 && errors.length > 0) {
      throw new Error(`stackexchange: all ${errors.length} queries failed — ${errors[0]}`);
    }
    return all;
  },
};
