# Landing page rework — design

**Date:** 2026-07-20
**Branch:** `worktree-feat+landing-page-rework`
**Status:** Approved, not yet implemented

## Problem

`apps/web/app/page.tsx` is 35 lines: an `h1`, a paragraph, four bullets, a CTA, and the auth widget. There is no nav, hero, feature section, pricing table, social proof, FAQ, or footer. `app/layout.tsx` exports no `metadata`, so the site has no title, description, or OG tags. There are no Terms or Privacy pages.

Separately, all customer-facing copy still advertises the **lifetime** pricing model that the annual-subscription migration replaced, and both the landing page and `/ideas` claim a **weekly** cadence that the approved subscription spec deliberately downgraded to monthly.

This is a greenfield build, not a restyle.

## Goals

1. A complete SaaS marketing page that explains the product, shows what you get, and converts.
2. A hero animation that explains the pipeline visually — the primary defense against generic, templated-looking output.
3. Terms of Service and Privacy Policy pages.
4. Correct pricing and cadence copy everywhere it appears.
5. Full SEO metadata.

## Non-goals

- No changes to payment logic, the pipeline, or the DB schema.
- No new idea-browsing features. `/ideas` and `/ideas/[slug]` get styling and copy fixes only.
- No CMS or blog.
- No i18n. English only, matching octobot.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Visual direction | **Dark archive** — neutral near-black, cited blockquotes, emerald rules | Editorial credibility without a paper metaphor that dies in dark mode. Reuses existing OKLCH tokens, so almost no theme surgery. |
| Color mode | **Dark only.** Hardcode `dark` on `<html>`, retire `next-themes` | User decision. Matches octobot. |
| Sections | 11 (sample-ideas cut) | `/ideas` already shows the 5 free ideas; duplicating them spends vertical space re-selling a one-click-away page. |
| Headline | *"Every idea here has someone asking for it."* | Leads with the differentiator and implicitly indicts idea-generator competitors. |
| Pricing shown | **R$110/year**, USD as parenthetical only | See "Pricing honesty" below. |
| Cadence claim | **Monthly** | The subscription spec's deliberate under-promise. |
| Sources claimed | **3** — Reddit, Hacker News, Product Hunt | X and LinkedIn are best-effort in the pipeline; confirmed by user as not production-reliable. |
| Animation library | `motion` (framer-motion v12) | Same as octobot; avoids maintaining two animation idioms. Only new dependency. |
| Proof-bar stats | **Derived from the DB at request time** | Marketing numbers that cannot go stale or become false. |

### Pricing honesty

The subscription spec markets R$110/yr as "≈$20/year". That is an FX snapshot. If a visitor is charged in BRL while the page advertises a USD figure, the amount on their statement will not match the page — a small dishonesty that produces chargebacks and support load.

The page leads with **R$110/year** and mentions "≈US$20" only as a parenthetical, never as the headline price.

### Trust constraints

The product's entire pitch is *"we show you the receipts."* Marketing copy that overstates is therefore unusually costly here. Two hard rules:

1. **No invented social proof.** There are no testimonials, no logo wall, and no user count. The page must not fabricate them or use the credibility-substitute patterns that fill the gap ("Loved by 1,000+ founders", "Trusted by teams at…").
2. **No unearned source claims.** The hero and copy name exactly the three sources the pipeline reliably covers.

## Visual system

Existing tokens in `packages/ui/src/styles/globals.css` are kept. Dark values become the only values.

- **Surface** — near-black neutral (`--background`), cards one step lighter with a `--border` hairline.
- **Primary** — the existing emerald. Used for rules, scores, eyebrows, and the primary CTA. Never for body text.
- **Type** — Figtree for headings and body; Geist Mono for eyebrows, metrics, labels, and metadata. The mono/sans split is the main carrier of the "archive" feel.
- **Body copy** — `text-muted-foreground`, with `text-foreground` reserved for emphasis.
- **Rhythm** — `max-w-6xl` for marketing sections, `max-w-3xl` for legal. `Section` padding `py-20 sm:py-28`.
- **Radius** — existing `--radius: 0.625rem` scale.

Shared primitives, ported from octobot's `components/section.tsx`:

- `<Section>` — `mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-28`
- `<Eyebrow>` — mono, `tracking-[0.2em]`, uppercase, primary, preceded by an `h-px w-6` rule
- `<SectionHeading eyebrow title intro align>` — `h2` at `text-3xl sm:text-4xl text-balance`, intro `max-w-2xl text-muted-foreground text-pretty`

## Page structure

Eleven sections, in order.

### 01 · Sticky nav
Wordmark · How it works · Pricing · FAQ · `Browse ideas` CTA. Transparent at rest, `backdrop-blur` + hairline border once scrolled past ~40px.

### 02 · Hero

- **Headline:** Every idea here has someone asking for it.
- **Subhead:** Every week we read public posts across Reddit, Hacker News, and Product Hunt looking for people describing a product that doesn't exist yet — then score the strongest signals and link each one back to the posts that prove it. Nobody's built them yet.

> **Deliberately no volume claim.** Earlier drafts said "tens of thousands of posts". That number is unverified, and asserting it would violate this spec's own trust constraint. Volume belongs in the proof bar, where it is derived from the database and cannot be wrong.

**Weekly vs. monthly — not a contradiction.** The pipeline *scans* weekly (GitHub Actions). New ideas are *published* monthly. Copy must keep these distinct: we read every week, we publish every month. Never write "new ideas weekly".
- **Primary CTA:** `Browse the ideas →` → `/ideas`
- **Secondary CTA:** `See how it works` → `#how-it-works`
- **Right/below:** the converge-and-condense animation (spec below).

The headline must be the LCP element, not the animation.

### 03 · Proof bar

Three derived stats (see "Derived statistics"). Odometer count-up on first view.

**Floor rule:** if published ideas < 25 or raw posts < 2,000, the section does not render. An absent stat bar is neutral; a weak one actively undersells.

### 04 · The problem

- **Eyebrow:** Why most side projects die
- **Heading:** Building something nobody asked for is the default outcome.
- **Body:** You can ship fast, write clean code, and still spend six months on a product with no demand behind it. The hard part was never the building. It's knowing what's worth building.

### 05 · How it works

Three steps, connector line drawing between them on scroll.

1. **Scan** — Every week we pull posts from Reddit, Hacker News, and Product Hunt.
2. **Cluster & score** — Posts describing the same missing product get grouped, scored for demand, and sized for revenue.
3. **You build** — You get the idea, the numbers behind it, and links to every post that produced it.

### 06 · Anatomy of an idea

The highest-value section: the only place a visitor sees what they are paying for. One full idea card, annotated with callouts that draw in sequence on scroll.

Callouts: demand score (0–100) · ask count · estimated MRR range · competition notes · validation signals · **source links**.

Closing line: *Every number here traces back to a post you can go read yourself.*

### 07 · Why evidence wins

Answers the objection that kills this category — *"why wouldn't I just ask an AI for 50 SaaS ideas?"* — which most visitors will never say out loud.

Two columns:

| Generated idea lists | NextBigThing |
|---|---|
| Plausible-sounding ideas invented on demand | Ideas extracted from posts real people wrote |
| No way to tell if anyone wants it | Ask counts from named sources |
| Confident revenue guesses | Ranges derived from comparable products, shown as ranges |
| Unfalsifiable | Every claim links to the post behind it |

### 08 · Pricing

Single tier. Free vs. Full comparison.

- **Free** — 5 ideas, no account needed.
- **Full — R$110/year (≈US$20)** — every idea published so far, plus everything published while your access is active.

Must state plainly, above the CTA, not buried in the ToS:

- Renews annually until cancelled.
- Cancel any time; access continues to the end of the paid period.
- Card payments only.
- 7-day refund on first purchase (Art. 49 CDC — see Legal).

### 09 · FAQ

Accordion. Questions:

1. How often do new ideas appear? — *New ideas are added every month.*
2. What happens when my access expires? — Hard lock back to the 5 free ideas; nothing is deleted.
3. Can I cancel? — Yes, any time; access runs to the end of the paid period.
4. Do I get refunds? — 7 days on first purchase.
5. Are ideas exclusive to me? — No. Every subscriber sees the same ideas. What you get is the evidence, not exclusivity.
6. Where do the ideas come from? — Public posts on Reddit, Hacker News, and Product Hunt, always linked.
7. Do you validate the ideas yourselves? — No. We measure what people are asking for; we don't judge whether a business will work.

Question 7 is deliberate. Overclaiming validation is the fastest way to lose credibility with this audience.

### 10 · Final CTA

Restates the promise, one button, no competing links.

### 11 · Footer

Columns: **Product** (Ideas, Pricing, How it works) · **Legal** (Terms, Privacy) · **Contact** (email). Bottom bar carries the legal entity name and CNPJ. External links get `target="_blank" rel="noreferrer noopener"`.

No "Open source" column — octobot's memory records that as removed intent, and it does not apply here.

## Hero animation

Approved from a working prototype. Four phases, ~9s per cycle.

| Phase | Duration | Behaviour |
|---|---|---|
| 1 · Gather | ~3.4s | Post cards arrive from a full 360°, jittered, drifting inward. Slow enough to read the quotes. |
| 2 · Condense | ~1.1s | Posts accelerate toward the centre, shrink, blur, and vanish into a glowing core. |
| 3 · Form | ~0.8s | Core flares, a shockwave ring expands, and the idea card unfolds outward from the same point. |
| 4 · Hold | ~3.2s | Demand score counts up; card is static and fully readable, then recedes. |

Requirements:

- Nothing exits the frame. Every post terminates at the centre — the transformation must be literal, not implied.
- The card is born at the collapse coordinates so cause and effect are unmistakable.
- Card footer reads `built from N posts · 3 sources`, tying the animation to the product.
- A phase caption (`gathering signals` → `condensing` → `scored idea`) narrates the sequence.
- `transform`/`opacity` only. No layout-affecting properties.
- Source badges: Reddit, Hacker News, Product Hunt. Text labels with colour dots, **not** platform logos — avoids trademark and external-asset issues.
- Sample quotes and ideas are illustrative and must be visibly plausible but not presented as specific real posts.

**Mobile:** the radial composition does not fit narrow viewports. Below `sm`, use a simplified variant — fewer posts, a shorter radius, vertical convergence — or a static composed card. Decided at implementation; must not horizontally overflow.

**Reduced motion:** `prefers-reduced-motion` renders the *composed final state* — a finished card with its real score — not an empty stage.

## Motion system

- `motion` v12 for scroll reveals and micro-interactions; the hero keeps its imperative Web Animations API choreography internally, which is stateful enough that declarative expression hurts more than it helps.
- Scroll reveals: `whileInView`, `once: true`, short translate + fade. **Content is never hidden pending animation** — if JS fails, the page is fully readable.
- `useReducedMotion` is a real branch in every animated component, rendering composed states.
- Client components: hero, nav, FAQ accordion, proof-bar counter. All other sections are server components.

## Derived statistics

`apps/web/lib/stats.ts` exposes `getLandingStats()`:

| Stat | Query |
|---|---|
| Ideas published | `count(ideas WHERE status = 'published')` |
| Posts scanned | `count(raw_posts)` |
| Posts in last 7 days | `count(raw_posts WHERE fetched_at > now() - interval '7 days')` |
| Sources | Constant `3` |

Sources is deliberately **not** `count(distinct raw_posts.source)` — that would silently begin claiming X and LinkedIn the moment a stray best-effort row lands, breaking the trust constraint.

Cached with a ~1h revalidation window. The landing page must not issue uncached counts on every request.

**Do not assume the caching API.** `apps/landing-page/AGENTS.md` in octobot and this repo's `AGENTS.md` both warn that Next 16 APIs differ from training data. Next 16 has moved caching toward the `use cache` directive, and `unstable_cache` may be deprecated or renamed. The implementer must read `node_modules/next/dist/docs/01-app/*` and use the current API rather than the one that looks familiar.

## Legal pages

Structure ported from octobot: a shared `<LegalPage title intro>` wrapper, plain TSX children (no MDX, no `@tailwindcss/typography`), prose styled via descendant variants on a single div. Constants interpolated — no legal fact hardcoded in JSX.

`apps/web/lib/content.ts` carries, reused verbatim from octobot (same legal entity, confirmed by user):

```
CONTACT_EMAIL      = "gabrielccarvalhopro@gmail.com"
COMPANY_NAME       = "NextBigThing"
COMPANY_LEGAL_NAME = "GABRIEL CAMPOS DOS SANTOS P DE CARVALHO LTDA"
COMPANY_CNPJ       = "58.378.419/0001-61"
GOVERNING_LAW      = "the Federative Republic of Brazil"
JURISDICTION_FORUM = "the Comarca de São Paulo/SP"
LAST_UPDATED       = "July 20, 2026"
```

Tone: plain-English, second person, short declarative paragraphs. Product-specific, not boilerplate. Target ~1,200–1,600 words each.

### Terms — sections

1. The service · 2. Eligibility and accounts · 3. Subscriptions, billing, and renewal · 4. Refunds · 5. What you may and may not do with the ideas · 6. Source content and third-party rights · 7. Acceptable use · 8. Third-party services · 9. Availability · 10. Disclaimers · 11. Limitation of liability · 12. Termination · 13. Changes to these terms · 14. Governing law and venue · 15. Contact

### Privacy — sections

1. What we collect · 2. How we use it · 3. What we never do · 4. Data we process about third parties · 5. Sub-processors · 6. Retention and deletion · 7. Security · 8. International data transfers · 9. Children · 10. Legal basis and your rights under the LGPD · 11. Changes to this policy · 12. Contact

### Exposures octobot did not have

These sections must be written specifically, not adapted generically:

1. **Third-party content.** Ideas are derived from public posts that are quoted and linked. Privacy needs a section on processing personal data not collected from our own users (post authors are data subjects). Terms must state plainly that source content belongs to its authors and the originating platforms, and that we claim rights only in our own analysis.
2. **Auto-renewal disclosure.** Brazilian consumer law requires clear pre-purchase disclosure of renewal and cancellation terms. This is why renewal terms appear in the **pricing section**, not only in the ToS.
3. **Right of regret.** Art. 49 CDC grants 7 days to cancel an online purchase. The stated refund policy must be at least this generous.

Sub-processors to name: AbacatePay (payments), the database host, the email provider (magic links), Google (OAuth), Anthropic (idea enrichment via Claude Haiku), and the hosting provider.

> **These pages are not lawyer-reviewed.** They are written to be accurate and specific, but they should get a real legal review before the product takes money.

## Copy corrections outside the landing page

The lifetime→annual migration left stale copy that this work must fix, or the site will contradict itself:

| File | Current | Fix |
|---|---|---|
| `app/page.tsx:18-20` | "single R$110 card payment — lifetime access" | Replaced wholesale |
| `app/page.tsx:21` | "weekly cadence" | Monthly |
| `components/paywall-cta.tsx:21,23` | "R$110 lifetime", "…forever." | Annual subscription wording |
| `app/account/page.tsx:22` | "Lifetime access active" | Renewal date + cancellation notice |
| `app/ideas/page.tsx` | "Updated weekly." | Monthly |
| `app/ideas/[slug]/page.tsx:36-38` | Locked-idea message | Subscription wording |
| `lib/payments/abacatepay.ts:93` | Error string mentions lifetime | Reworded |
| `lib/payments/provider.ts:5` | Comment "≈ $20 lifetime access" | Reworded |

`app/api/payments/checkout/route.ts:15` also carries a comment asserting a second charge is never legitimate. That is a **logic** concern for the subscription migration, not copy, and is out of scope here — but it is noted so it is not mistaken for a copy fix.

## SEO

`app/layout.tsx` gains full metadata, following octobot:

- `metadataBase`, title template `"%s · NextBigThing"`, description
- OpenGraph + Twitter card with a versioned `/og.png`, descriptive alt text
- `app/robots.ts` and `app/sitemap.ts` as route handlers
- Per-page `metadata` on `/terms` and `/privacy`

## File inventory

**New**
```
apps/web/lib/content.ts               copy + legal constants
apps/web/lib/stats.ts                 getLandingStats()
apps/web/components/section.tsx       Section, Eyebrow, SectionHeading
apps/web/components/site-header.tsx
apps/web/components/site-footer.tsx
apps/web/components/legal/legal-page.tsx
apps/web/components/sections/hero.tsx
apps/web/components/sections/hero-animation.tsx   (client)
apps/web/components/sections/proof-bar.tsx
apps/web/components/sections/problem.tsx
apps/web/components/sections/how-it-works.tsx
apps/web/components/sections/anatomy.tsx
apps/web/components/sections/why-evidence.tsx
apps/web/components/sections/pricing.tsx
apps/web/components/sections/faq.tsx
apps/web/components/sections/final-cta.tsx
apps/web/app/terms/page.tsx
apps/web/app/privacy/page.tsx
apps/web/app/robots.ts
apps/web/app/sitemap.ts
```

**Modified**
```
apps/web/app/page.tsx                 rebuilt as thin composition
apps/web/app/layout.tsx               metadata, dark hardcoded, dead Geist import removed
apps/web/components/theme-provider.tsx  removed (with the `d` hotkey)
packages/ui/src/styles/globals.css    light tokens retired
apps/web/app/ideas/page.tsx           chrome + cadence copy
apps/web/app/ideas/[slug]/page.tsx    chrome + subscription copy
apps/web/app/account/page.tsx         chrome + subscription copy
apps/web/app/admin/page.tsx           chrome only
apps/web/components/paywall-cta.tsx   subscription copy
apps/web/lib/payments/abacatepay.ts   error string
apps/web/lib/payments/provider.ts     comment
```

## Safety constraint

`components/locked-teaser.tsx` takes a branded `TeaserIdea` type specifically so paid fields cannot reach unpaid visitors. **A redesign must not widen this back to the full `Idea` type.** Restyling the teaser is fine; changing its prop type is a paywall bypass.

## Testing

- **Unit** — `getLandingStats()` including the floor rule; content constants render without undefined interpolation.
- **Paywall regression** — existing `LockedTeaser` type-narrowing tests must still pass; add one asserting no paid field appears in locked-teaser output.
- **Build** — `pnpm typecheck`, `pnpm build`, `pnpm lint` clean.
- **Accessibility** — keyboard-navigable nav and FAQ; visible focus states; contrast ≥ 4.5:1 for body text on the dark surface; animation respects `prefers-reduced-motion`.
- **Responsive** — no horizontal overflow at 320/375/390/430px. Hero variant verified on each.
- **Manual** — with JS disabled, all copy is readable and no section is blank.

## Known pre-existing breakage

`apps/web/lib/viewer-access.ts:20` does not compile — `computeAccess` gained a `now` parameter in the annual-subscription work (commit `8ce1059`) and this caller was not updated. It is inherited from HEAD, unrelated to this work, and **out of scope**. It must be fixed before this branch can merge to a green build, but it belongs to the subscription migration.

## Risks

| Risk | Mitigation |
|---|---|
| Landing page advertises annual pricing the checkout doesn't fully implement yet | **This branch must not deploy to production before the remaining subscription-migration tasks land.** Recorded here as a release gate. |
| Hero animation hurts LCP | Transform/opacity only; headline is the LCP element; animation mounts after first paint. |
| Hero animation is heavy on mobile | Simplified or static variant below `sm`. |
| Derived stats are unflattering on a young database | Floor rule hides the section until the numbers earn their place. |
| Legal pages are not lawyer-reviewed | Stated explicitly, in this spec and to the user. |
| Dark-only migration leaves light-mode artifacts on secondary pages | `/ideas`, `/account`, `/admin` are explicitly in scope. |

## Open items

- **Brand name is assumed.** `COMPANY_NAME = "NextBigThing"` is inferred from the repo name `next.bigthing`; no file in the repo states the customer-facing brand. It appears in the wordmark, page titles, OG tags, and both legal pages. **Confirm before implementation** — it is cheap to change now and tedious later.
- **`og.png` asset** — needs to be designed or generated. Not blocking implementation; the metadata reference can land first.
- **Refund mechanics** — the 7-day CDC refund is stated as policy, but whether refunds are processed manually through AbacatePay or automated is undecided. Manual is acceptable at current volume and is what the copy will imply.
