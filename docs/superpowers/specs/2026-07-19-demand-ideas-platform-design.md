# NextBigIdea — SaaS Demand Ideas Platform — Design

**Date:** 2026-07-19
**Status:** Approved by Gabriel (brainstorming session)

## What we're building

A product that continuously mines social platforms for expressed demand for SaaS/micro-SaaS products ("I wish there was a tool that…", "is there anything that does…") and delivers it as a curated, data-enriched idea database. Each idea carries demand evidence: source posts, ask counts, potential MRR estimate, niche, validation signals.

**Business model:** 5 ideas free for everyone; full database unlocked with a **$20 (≈ R$110) one-time lifetime purchase** via AbacatePay (PIX). Lifetime buyers see all current and future ideas.

## Decisions made (with rationale)

| Decision | Choice | Why |
|---|---|---|
| Data collection | Fully automated pipeline | Freshness, no manual weekly labor |
| Data budget | $0/mo | Validate before spending; free APIs (Reddit, HN, Product Hunt) as backbone |
| X + LinkedIn | Unofficial scraping (best-effort) | $0 constraint; treated as degradable optional sources; ToS/ban risk accepted and isolated |
| Adapter design | Every source behind one swappable interface | Explicit requirement: swap unofficial scrapers for official APIs later with zero downstream change |
| Product shape | Idea database webapp | Browsable/filterable directory; growing content justifies "lifetime" |
| Enrichment | Claude Haiku via API, ~$5/mo hard cap | Only real monthly cost; reliable automation |
| Cadence | Weekly batch | QA window before publish, predictable marketing hook, tiny LLM cost |
| Payments | AbacatePay (PIX) behind a `PaymentProvider` interface | Gabriel's choice; PIX-centric means BRL/Brazilian buyers at launch; global provider is a later adapter |
| Auth | Better Auth: Google OAuth + email magic link | No passwords, free (Resend free tier for email) |
| Pipeline runtime | GitHub Actions weekly cron | Free (2000 min/mo), runs Playwright headless browsers; Vercel free tier can't |
| Web hosting / DB | Vercel free tier / Neon Postgres free tier | $0 |

## Architecture

```
GitHub Actions (weekly cron, free)
  └─ packages/pipeline
      ├─ adapters: reddit │ hn │ producthunt │ x* │ linkedin*
      │            (*unofficial, degradable, swappable)
      ├─ dedupe + cluster posts → demand signals
      └─ Haiku enrichment → scored draft ideas (~$5/mo cap)
            │
            ▼
      Neon Postgres (free tier)
            ▲
            │ reads
  Vercel free tier
  └─ apps/web (Next.js + shadcn)
      ├─ public: landing + 5 free ideas
      ├─ locked: full DB behind auth + paywall (server-side gating)
      └─ AbacatePay webhook → lifetime unlock
```

**Monorepo layout** (existing Turborepo/pnpm):
- `apps/web` — Next.js App Router + shadcn (exists)
- `packages/db` — Drizzle schema + Neon client, shared by web and pipeline (new)
- `packages/pipeline` — TypeScript CLI run by GitHub Actions (new)

## Section 1 — Pipeline & data model

### Source adapter interface (the swappable core)

```ts
interface SourceAdapter {
  name: string; // "reddit" | "hn" | "producthunt" | "x" | "linkedin"
  fetchPosts(since: Date): Promise<RawPost[]>;
}
```

- Adapters registered in a config map; enabled/disabled per env var.
- Swapping `x-unofficial` (Playwright + session cookie) for `x-official` (paid API) = one new adapter file + config flip. Nothing downstream changes.
- Reddit, HN, Product Hunt: free official APIs.
- X, LinkedIn: best-effort unofficial scrapers (Playwright, burner-account session cookies stored in Actions secrets). Failures degrade gracefully: a broken adapter logs and is skipped; it never kills the run.

### Weekly run stages

1. **Fetch** — each enabled adapter pulls posts since last successful run. Demand-signal queries: "I wish there was", "is there a tool", Ask HN threads, r/SaaS, r/smallbusiness, r/Entrepreneur pain threads, etc.
2. **Normalize + dedupe** — into `raw_posts`, unique on `(source, source_post_id)`.
3. **Relevance filter** — cheap keyword pre-filter, then Haiku classifies "is this a real product demand?"
4. **Cluster** — Haiku groups the batch into demand themes. Each theme is matched against existing ideas via `pg_trgm` similarity on title/keywords; matches **append evidence and bump ask-counts** on the existing idea instead of creating a duplicate.
5. **Enrich** — per new idea: title, one-liner, description, niche, demand score, competition notes, **potential MRR range** (transparent heuristic: audience-size signals × plausible price point × conservative conversion; always labeled as an estimate), validation signals (existing products, willingness-to-pay quotes).
6. **Upsert as drafts** — weekly QA window via admin page. A token-cost counter aborts enrichment before exceeding the ~$5/mo cap.

### Tables

- `pipeline_runs` — id, started/finished, status, per-source stats (jsonb)
- `raw_posts` — id, source, source_post_id (unique with source), url, author, content, posted_at, metrics jsonb (upvotes/comments/likes), run_id
- `ideas` — id, slug, title, one_liner, description, niche, demand_score, mrr_low, mrr_high, competition_notes, validation_signals jsonb, ask_count (derived), status (`draft`/`published`), `is_free` flag, published_at
- `idea_evidence` — idea_id ↔ raw_post_id, role; drives ask-count and the "sources" display
- Better Auth tables + `purchases` — user_id, provider, provider_charge_id, amount, status, paid_at

## Section 2 — Webapp, auth & paywall

### Pages

- **Landing** — pitch, sample idea card, pricing ($20 lifetime / PIX ≈ R$110)
- **/ideas** — filterable directory (niche, demand score, recency, ask count). The 5 `is_free` ideas fully visible; locked ideas show title + niche + blurred metrics as teaser.
- **/ideas/[slug]** — full detail: description, MRR estimate + methodology, every source post linked with dates/metrics, ask-count trend, validation signals. **Gated server-side (RSC)** — locked content is never present in the payload for non-payers (no CSS-blur bypass).
- **/admin** — allowlisted by user id: review drafts, edit, publish, mark free ideas.
- **/account** — purchase status.

### Auth

Better Auth — Google OAuth + email magic links. Resend free tier for magic-link email delivery.

### Payments

```ts
interface PaymentProvider {
  createCheckout(userId: string): Promise<{ url: string }>;
  verifyWebhook(req: Request): Promise<PaymentEvent>;
}
```

AbacatePay implementation: create PIX charge → QR/redirect → webhook confirms → `purchases` row marked paid → lifetime unlock. Adding Stripe/Polar later for global buyers is one new adapter.

## Section 3 — Ops, errors & testing

- **Failure isolation:** per-adapter try/catch. Each run writes a `pipeline_runs` report (per-source fetched/failed counts). GH Actions job summary displays it; a failed run auto-opens a GitHub issue.
- **Scraper realism:** X/LinkedIn session cookies will expire/break. The run report surfaces it; the product stays healthy on Reddit/HN/PH alone.
- **Testing:** unit tests for normalization and clustering-match logic with fixture data; adapter contract tests against recorded fixtures (no live scraping in CI); one e2e check that a non-payer cannot fetch locked idea content.
- **Costs:** Vercel free, Neon free, GH Actions free, Resend free, Haiku ≤ $5/mo hard cap. Total ≈ $5/mo.

## Out of scope (for launch)

- Official X/LinkedIn API integrations (post-revenue upgrade)
- Global payment providers (Stripe/Polar adapter later)
- Newsletter/weekly-drop email product
- Real-time/continuous ingestion
- Embedding-based clustering (pg_trgm matching is enough at weekly-batch scale)

## Risks

- **Unofficial scrapers** violate X/LinkedIn ToS; accounts/IPs can be banned and breakage is expected. Mitigated by isolation + graceful degradation; core value never depends on them.
- **PIX-only payments** limit paying audience to Brazil at launch. Accepted; `PaymentProvider` interface keeps the door open.
- **MRR estimates are heuristics** — always displayed as labeled ranges with methodology to protect credibility.
