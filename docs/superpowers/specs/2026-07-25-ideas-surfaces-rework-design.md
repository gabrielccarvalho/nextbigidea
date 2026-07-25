# Ideas surfaces rework — catalog cards + idea detail

**Date:** 2026-07-25
**Scope:** `/ideas` listing cards, `LockedBlocker` skeletons, `/ideas/[slug]` detail page (unlocked + locked views), shared formatting helpers, small `content.ts` additions.

## Problem

The landing page sells the product with the `SpecimenCard` — a dense, receipt-heavy
artifact (mono microtype labels, tabular numbers, hairline stat dividers, chart-1
accent, source-colored evidence dots). But the product itself doesn't deliver that
look: `IdeaCard` is a bare bordered box with three inline stats, and the detail page
is a plain document of headings and paragraphs. The paying surfaces look *worse*
than the marketing example of them.

## Design principle

The landing page promises "every published idea carries the same receipts" as the
example entry. The rework makes that literally true: the real card and detail page
reuse the specimen's visual vocabulary and its labels.

- **Shared labels:** hoist the specimen's stat labels into `IDEA_LABELS` in
  `content.ts`; `SPECIMEN.labels` references it, and the real card/detail stat
  band consume it. The example and the product can no longer drift apart.
- **Shared numbers treatment:** mono, `tabular-nums`, compact money ranges in the
  specimen's `$2–6k` format via a new `formatMoneyRange(low, high)` helper
  (tested). Raw `~$2000–6000 MRR` disappears.
- **Sources as receipts:** DB evidence rows carry pipeline slugs (`hackernews`,
  `github`, `stackexchange`). A `sourceDisplay(slug)` helper maps them to the
  display names + brand colors already in `SOURCES`, with a neutral fallback for
  unknown slugs. Evidence rows get the specimen's colored-dot treatment.

## Components

### IdeaCard (condensed specimen)

- `rounded-xl` bordered card, `overflow-hidden`, footer pinned with flex so card
  heights align across the grid.
- Header: niche eyebrow (mono, chart-1) + optional "Free sample" chip when
  `idea.isFree`; title; one-liner clamped to 2 lines.
- Top-right: demand score — large mono chart-1 number, `Demand` microlabel, and
  the specimen's thin progress bar.
- Footer: 2-cell hairline stat row (`gap-px` over `bg-border`) — asks count and
  compact MRR range.
- Hover: border tints to chart-1, faint chart-1 wash, slight lift. Keyboard focus
  ring preserved.
- Access rule unchanged: the card still renders only for unlocked ideas.

### LockedBlocker

Skeleton cards updated to mirror the new card anatomy (rounded-xl, eyebrow/title
bars, blurred chart-1 score block, hairline footer cells). Still `aria-hidden`,
still renders NO real data — only the locked count overlay.

### /ideas page

Header gets the landing's eyebrow treatment (`The catalog`), a tighter title
scale, and a mono published-count on the right. Container widens to `max-w-5xl`
to give the richer cards room. Both branches (free-only and paid) share the same
header; grid and pagination logic untouched.

### /ideas/[slug] — unlocked

"See what matters fast" = a stat band above the fold, receipts styled as receipts:

1. Header: back link, niche eyebrow with dash, display-scale title, one-liner.
2. **Stat band** — bordered card, 4 hairline cells: Demand (score + bar, chart-1),
   Asks, Est. MRR (compact range), Sources (evidence count). The MRR methodology
   disclaimer becomes the band's fine-print footer row, so the number and its
   caveat travel together.
3. Sections with mono uppercase micro-headings (specimen style): The opportunity,
   Validation signals (chart-1 dot rows with hairline separators), Competition,
   Sources — evidence rows with source-colored dot, linked title, mono source
   label and date, hairline separators.

Container widens to `max-w-3xl`. All copy stays in `content.ts` (`IDEA_DETAIL`
headings unchanged).

### /ideas/[slug] — locked

Same header treatment (still only `title` + `niche` via `toTeaserIdea`), then a
LockedBlocker-style panel: data-free blurred skeleton of the stat band + text
lines behind a gradient overlay carrying `IDEA_DETAIL.lockedMessage` and the
`PaywallCta`. Server-side gate unchanged — no other idea fields referenced, no
evidence fetched.

## New code

- `apps/web/lib/format.ts` — `formatMoneyRange(low, high)` and
  `sourceDisplay(slug)`; unit-tested in `format.test.ts`.
- `content.ts` — `IDEA_LABELS` (hoisted), `IDEAS_PAGE.eyebrow`,
  `IDEAS_PAGE.countSuffix`, `IDEAS_PAGE.freeTag`. All new strings pass the
  copy-rule tests (no banned phrases, no new sources, no bare USD price).

## Non-goals

- No data model or query changes; no new fields.
- No change to access gating, pagination, ordering, or paywall flows.
- No landing page changes beyond the internal `SPECIMEN.labels` hoist.
