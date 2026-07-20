# Landing page rework — design

**Date:** 2026-07-20
**Status:** Approved, ready for implementation planning

## Problem

The landing page reads as generic AI-generated marketing. This is not a vague
impression — it has identifiable mechanical causes:

1. **One card treatment, repeated.** Every section is built from the same three
   primitives: `rounded-xl border border-border bg-card p-6`, a
   `grid sm:grid-cols-2/3`, and a mono uppercase eyebrow. One radius (14px)
   across the entire page. With no variance there is no hierarchy.
2. **Uniform vertical rhythm.** Every section is `py-20 sm:py-28`. Sections with
   two sentences of content get the same vertical budget as sections with a
   six-cell grid, producing large dead voids — worst in `Problem`, which is one
   heading and two lines alone on a screen.
3. **No motion.** 9 of 11 section files have zero animation. The only motion is
   `hero-animation.tsx` and the `stat-counter.tsx` count-up.
4. **The hero animation is boxed.** It renders inside a bordered, rounded,
   `bg-card` container, reading as an embedded widget rather than as the page.
5. **The product is described, never shown.** The pitch is "scored ideas backed
   by evidence," and the page renders not a single scored idea. `Anatomy of an
   idea` names the fields in a `<dl>` instead of showing one.

Cause 5 is the root defect. The flatness is partly *because* the page is entirely
abstract description — no styling fixes a page with nothing concrete on it.

## Goals

- A visitor sees a complete, concrete scored idea before the end of the first scroll.
- Sections are visually connected rather than floating independently.
- Visual variance carries hierarchy: not every element is a card.
- Motion is present and purposeful, without adding a dependency.

## Non-goals

- No redesign of `/ideas`, `/ideas/[slug]`, `/account`, or the legal pages.
- No copy rewrite beyond what section restructuring forces.
- No light theme. The app is dark-only by design (`dark` class hardcoded on `<html>`).
- No new npm dependency.

## Direction

**"The Specimen"** — one artifact held up to the light, with a **dossier**
visual language (numbered rail, mono labels, hairline dividers, source-colored dots).

The persuasive spine, in priority order:

1. **Primary:** "I don't know what I'm getting." → show the artifact, early and large.
2. **Supporting:** "I don't believe the ideas are real." → evidence and provenance.

The page shows a complete scored idea, spends its middle teaching the visitor how
to read it, and only then states the price.

## Page spine

Eight sections, down from nine.

| # | Section | Status | Notes |
|---|---------|--------|-------|
| 01 | Hero | rebuilt | Animation un-carded, becomes full-bleed ambient field |
| 02 | The Specimen | **new** | One complete idea card, rendered large |
| 03 | The Dissection | **new** (absorbs `Anatomy`) | Specimen pins; four passages scroll past |
| 04 | Where it comes from | rebuilt | Pipeline steps drawn on the rail, not three identical cards |
| 05 | Why evidence wins | kept, redesigned | Comparison stays; must stop looking like the other grids. Absorbs the proof-bar stats |
| 06 | Pricing | kept | Strongest existing section; minimal change |
| 07 | FAQ | kept | Stays native `<details>` |
| 08 | Final CTA | tightened | Terminates the rail |

The current `ProofBar` ceases to be its own section — its three stats move into
05, where they support an argument instead of floating after the hero.

**Dropped:** the standalone `Problem` section. Its argument ("building something
nobody asked for is the default outcome") becomes hero subtext. It was the
largest single contributor to dead space.

## Section designs

### 01 — Hero

The animation loses its container entirely: no border, no `rounded-xl`, no
`bg-card`. It becomes an ambient field that bleeds off both viewport edges and
fades into the page background at its lower boundary via a gradient mask.

Post cards drift *behind and around* the centered pitch rather than in a box
below it. The existing `hero-animation.tsx` geometry work is preserved — only
the container treatment and z-layering change.

Content is unchanged: eyebrow, h1, subhead, two CTAs.

### 02 — The Specimen

One complete idea card, rendered at roughly 2× the visual weight of anything
else on the page. It is the **only** glowing bordered object on the page.

Card anatomy:
- `EXAMPLE ENTRY` tag (mono, bordered, muted) — see *Content integrity* below
- Niche (mono, uppercase, emerald)
- Title (~17–20px, 650 weight, tight tracking)
- One-liner (muted)
- **Demand score** — large mono numeral, `--chart-1` emerald, with a thin fill meter
- Stat row — three hairline-separated cells: asks, est. MRR, source count
- Evidence block — three quotes with source-colored dots and source labels

### 03 — The Dissection

The specimen becomes `position: sticky` while four passages scroll past it in a
right-hand column: **The score / The numbers / The receipts / The catch**.

The active passage is full opacity; inactive ones drop to ~32%. A rail segment
tracks down the left of the passage column, and the corresponding region of the
specimen card highlights.

This section replaces the current `anatomy.tsx` `<dl>` hairline grid, which
names the fields without showing them.

### 04 — Where it comes from

The three pipeline steps from `HOW_IT_WORKS.steps[]`, rendered as a sequence on
the rail rather than three identical bordered cards in a `sm:grid-cols-3`.

### 05 — Why evidence wins + proof numbers

The existing generated-vs-ours comparison, restyled off the shared card
primitive. The three `ProofBar` stats fold in here as supporting evidence for
the argument, rather than floating as a standalone card row after the hero.

`StatCounter`'s count-up behavior is preserved.

### 06 — Pricing / 07 — FAQ / 08 — Final CTA

Structurally unchanged. Pricing keeps its glow treatment (it is the one place a
card is doing real work). FAQ keeps native `<details>`. The final CTA terminates
the rail.

## Visual system

### Color

Current tokens stay. Two currently-unused levers get put to work:

- **`--chart-1`** (`oklch(0.845 0.143 164.978)` ramp; the brighter emerald) is
  used for the demand score and other numeric emphasis. `--primary`
  (`oklch(0.432 0.095 166.913)`) is dark and desaturated — correct for button
  fills, dead as a large numeral.
- **Source colors** from `SOURCES` in `content.ts` (Reddit `#ff4500`, Hacker News
  `#ff6600`, Product Hunt `#da552f`) become a real part of the visual language
  via evidence dots, not just data.

Note: `--accent`, `--muted`, and `--secondary` are currently set to the identical
value, so the palette has no accent beyond the emerald. This is left as-is;
`--chart-1` covers the need.

### Structure

**Rule: the specimen is the only glowing bordered card on the page.** Supporting
content uses hairline dividers, rails, and bare background. This is the primary
correction for the "everything is a card" defect.

### Rhythm

Section padding stops being uniform `py-20 sm:py-28`. Dense sections tighten;
only the hero and final CTA get generous vertical space.

### Type

`--font-heading` currently aliases `--font-sans` (Figtree) — no distinct display
face. This stays. Differentiation comes from weight, tracking, and scale, plus
heavier use of Geist Mono for labels, numerals, and rail annotations.

## Motion

**No new dependency.** Two mechanisms, both already proven in this codebase:

1. **`IntersectionObserver` + CSS transitions** for scroll reveals and for
   driving the dissection's active-passage state. This extends the pattern in
   `stat-counter.tsx`.
2. **`position: sticky`** for the specimen pin — CSS only, no JS.

`tw-animate-css` (already installed, currently unused) is available for
enter transitions.

**Explicitly rejected:** CSS `animation-timeline: view()`. Native scroll-driven
animation has insufficient browser support and would need a JS fallback anyway,
which defeats the purpose.

**`prefers-reduced-motion`:** all motion is gated. Reduced-motion users get the
fully-composed static state — the pattern `hero-animation.tsx` already uses.
Under reduced motion the dissection renders all four passages at full opacity
with no sticky tracking.

## Mobile

The sticky/dissection layout is desktop-only. Below the `lg` breakpoint it
collapses to a stacked sequence: specimen card, then the four passages beneath
it, no pinning and no scroll tracking. The specimen card is designed to remain
legible at 320px — the stat row wraps rather than compressing.

## Content integrity

The specimen's content is **hardcoded** in `content.ts` (a new `SPECIMEN` export)
rather than queried from the database. This was a deliberate choice for design
control over the page's most important element.

Two constraints follow, and they are requirements, not suggestions:

1. The card carries a visible `EXAMPLE ENTRY` tag.
2. Evidence rows render as **plain text with source labels — not as links**.

Rationale: the page's central claim is that every number traces back to a post
you can go read. Fabricated URLs presented as verifiable receipts would make that
claim false on the very page that makes it. A labeled illustrative example is
honest; a fake audit trail is not.

Existing `SAMPLE_IDEAS` / `SAMPLE_POSTS` (already commented as "plausible
paraphrases, NOT quotations") continue to feed the hero animation unchanged.

## Files affected

**New:**
- `apps/web/components/sections/specimen.tsx`
- `apps/web/components/sections/dissection.tsx`
- `apps/web/components/specimen-card.tsx` (the card itself, so it can be reused)

**Rewritten:**
- `apps/web/app/page.tsx` — new section order
- `apps/web/components/sections/hero.tsx` — un-carded animation
- `apps/web/components/sections/hero-animation.tsx` — container/z-layer only; geometry preserved
- `apps/web/components/sections/how-it-works.tsx` — rail sequence
- `apps/web/components/sections/why-evidence.tsx` — absorbs proof stats, off the card primitive
- `apps/web/components/section.tsx` — variable rhythm, rail primitive

**Deleted:**
- `apps/web/components/sections/problem.tsx`
- `apps/web/components/sections/anatomy.tsx` (absorbed into dissection)
- `apps/web/components/sections/proof-bar.tsx` (folded into why-evidence)

**Modified:**
- `apps/web/lib/content.ts` — add `SPECIMEN`; remove `PROBLEM`; adjust `ANATOMY`
- `apps/web/lib/content.test.ts` — follow content changes

## Testing

- `content.test.ts` updated for the new/removed content exports.
- Existing suite (93 tests) must stay green; none of it covers landing visuals.
- Manual verification: `prefers-reduced-motion` on, 320px width, and keyboard
  traversal of the FAQ and CTAs.
- `pnpm typecheck` and `next build` clean. Note that `next build` requires
  `DATABASE_URL` to be set.

## Known issue surfaced during design

`ProofBar` currently swallows database failures and returns `null`. In this
worktree (no `DATABASE_URL`) that means the proof bar silently disappears while
the rest of the page renders — and `/ideas` throws outright. Folding the stats
into section 05 inherits this behavior. Worth deciding separately whether silent
disappearance is the right failure mode; **out of scope for this rework.**
