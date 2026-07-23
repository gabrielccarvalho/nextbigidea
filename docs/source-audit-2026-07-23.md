# Data source audit — 2026-07-23

Verdicts on every candidate source for the demand-signal pipeline, from live API
probes and primary ToS/licensing documents fetched on this date. Supersedes the
informal audit referenced by `apps/web/lib/content.test.ts`; the registry in
`packages/pipeline/src/run.ts` must stay consistent with this file.

## In the pipeline (all free)

### Hacker News — Algolia Search API ✅
- `https://hn.algolia.com/api/v1/search_by_date`, no auth, 10,000 req/hour/IP.
- Any single query retrieves at most 1,000 hits regardless of paging; the
  adapter walks `numericFilters=created_at_i` time windows to go deeper
  (`walkPhrase` in `adapters/hackernews.ts`).
- Quoted queries do literal phrase matching; unquoted is OR-of-words.

### Stack Exchange — API v2.3 ✅ (conditions)
- `https://api.stackexchange.com/2.3/search/advanced`, free; 300 req/day
  keyless, 10,000 with a free stackapps.com key (`STACKEXCHANGE_KEY`).
- Max 30 req/sec; the `backoff` response field is strictly enforced and the
  adapter honours it.
- Content is CC BY-SA (2.5/3.0/4.0 by contribution date) — commercial use is
  expressly permitted. **Binding conditions before an SE-derived idea page
  displays any excerpt:** label the source, link directly to the question, show
  the author's name linked to their profile, and mark quoted text CC BY-SA.
  (`raw_posts` stores author + question URL today; author *profile* URLs are a
  pending follow-up.) Do not train models on the corpus and do not redistribute
  bulk data — that is the one thing SE actively polices (their paid Data
  Licensing product). LLM inference over fetched posts breaches nothing in the
  current API terms.
- Sites queried: softwarerecs (wall-to-wall demand, low fresh volume — its 23k
  archive is the value), superuser, webapps, askubuntu, apple, android.

### GitHub — REST search ✅
- `GET /search/issues` with `advanced_search=true` (legacy syntax removed
  2025-09). Own rate bucket: 30 req/min authenticated; adapter paces 2s
  between requests. 1,000-results cap per query; slice `created:` windows to
  go past it.
- ToS §D.5 (license to use public repo content) and §D.8 (no restriction on
  lawful third-party use) permit commercial use. §D.9 caveat: training a
  commercial AI system on GitHub data triggers reciprocity — we only run
  inference, never training.

## Cleared, not yet integrated (roadmap)

| Source | Verdict | Notes |
|---|---|---|
| Lemmy | GREEN | Open per-instance API, lemmy.world ToS permits good-faith automation. Native search is useless (no phrase matching) — poll `c/asklemmy`, `c/selfhosted` etc. and filter locally. Modest volume. |
| CFPB complaints DB | GREEN | US-gov public domain, no auth, phrase search over consumer narratives. Fintech-vertical ideas only. |
| App Store reviews (iTunes RSS) | YELLOW | `itunes.apple.com/{cc}/rss/customerreviews/id={app}/json` is free and alive; highest demand density of anything audited ("missing feature" reviews). Conditions: consume ONLY the RSS feed, publish derived ideas not review dumps, no app rankings. Needs an app-ID enumeration strategy. |
| Mastodon | YELLOW | Per-instance: mastodon.social ToS (2025-07) bans scraping → treat as RED there; permissive instances (fosstodon.org verified open) are fine but low-volume. |
| Bluesky | BLOCKED for now | ToS/licensing fine, but `app.bsky.feed.searchPosts` stopped being publicly accessible in 2025 (deliberate 403 on the public AppView). Requires an authenticated session (app password + `createSession`, 3,000 req/5min). Add only via honest authenticated access — never via URL-casing tricks that dodge the CDN block. |
| Farcaster | WATCH | Public Snapchain hubs are free/no-auth but have no keyword search; Neynar (acquired the infra 2026-01) gates search behind a small free tier. |

## Rejected — do not add

| Source | Why |
|---|---|
| Reddit | Responsible Builder Policy prohibits commercial use without written approval; the 403s are enforcement. |
| Product Hunt | Terms prohibit commercial use of their data without approval. Unregistered from the pipeline 2026-07-23. |
| X / LinkedIn | Only reachable via logged-in headless browser; ToS violation + account risk. |
| YouTube | API Developer Policies §III.E.2 (no cross-owner aggregation) and §III.G.1 (no selling API-derived data) squarely prohibit this business model. |
| dev.to | Terms grant "personal, non-commercial" use only. |
| Google Play reviews | Official API is own-apps-only; everything else is a ToS-violating scraper. |
| Trustpilot / G2 / Capterra | Review APIs are paid/partner-gated; terms bar reproduction. |
| Lobsters | Maintainer explicitly asks commercial services not to scrape; requires contacting them. |
| Discourse forums | Default ToS prohibits automation (search engines excepted); per-instance permission needed. |
| Indie Hackers | No API; Cloudflare-blocked. |
