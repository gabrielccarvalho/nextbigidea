# Copy rework — "money on the table" voice

**Date:** 2026-07-25
**Status:** Approved (design reviewed in session)

## Problem

The current copy is honest but flat. The hero ("Every idea here has someone asking
for it.") describes the product without making anyone want it. The user asked for
catchy, conversion-driven copy across the whole site.

Separately, `app/layout.tsx` metadata still names Reddit and Product Hunt as
sources — forbidden by the source audit (their ToS prohibit commercial use of
their data without written approval). The content test never caught it because
metadata strings live outside `lib/content.ts`.

## Direction (chosen from three options)

**"Money on the table"** — greed/opportunity-driven. The copy leads with the fact
that real people are publicly asking to pay for products nobody has built, and
that the reader could be the one to build them. Rejected alternatives:
pain-driven ("your last project died because nobody asked for it") and
edgy-insider ("your next product is buried in someone else's complaint").

## Voice rules

- Direct, greedy-smart, second person. Short sentences.
- The money and the unfairness of the opportunity do the selling — never adjectives.
- Every claim stays literally true. No invented social proof, no hype.
- All existing `lib/content.test.ts` rules continue to hold: banned-word list,
  three sources only (Hacker News, GitHub, Stack Exchange), price in BRL with USD
  only as `≈` parenthetical, "one-time payment" present, scan weekly / publish
  monthly (never "new ideas weekly").

## Final copy

### HERO
- eyebrow: `Found in public. Ready to build.`
- headline: `People are literally asking to pay for products that don't exist.`
- subhead: `We read thousands of posts on Hacker News, GitHub, and Stack Exchange
  and pull out the ones where people describe a product they'd pay for — with
  links to every post. Nobody's built these yet. That's the whole point.`
- primaryCta: `Show me the ideas` · secondaryCta: `See what R$110 buys`

### SPECIMEN
- sectionTitle: `This is what you're buying.`
- intro: `One entry, in full. Every published idea carries the same receipts —
  the score, the numbers, and the posts behind them — so you can judge it like
  you found it yourself.`
- exampleTag, evidenceHeading, labels, and the specimen idea itself: unchanged
  (content-integrity constraints).

### DISSECTION
- 01 The score: `0–100, from how many people asked and how loudly. A 94 means it
  came up constantly, in frustrated language. Frustration is demand.`
- 02 The numbers: `Asks are distinct posts, not upvotes. The revenue figure is a
  range built from comparable products — a range, because that's what it honestly is.`
- 03 The receipts: `Every claim traces to a post. On a published entry these are
  live links — go read the demand yourself before you spend a weekend on it.`
- 04 The catch: `What already exists, and exactly where it falls short of what
  people asked for. That gap is your way in.`

### WHY_EVIDENCE
- eyebrow: `Why this beats guessing`
- title unchanged: `Why not just ask an AI for fifty ideas?`
- intro: `You can. You'll get fifty plausible sentences and zero proof anyone
  will pay. Here's the difference.`
- rows unchanged, except row 1 ours-side: `Ideas pulled from posts real people wrote`

### PAYWALL_CTA (component renders `{headlinePrefix} — R$110`)
- headlinePrefix: `Every idea, one payment`
- subtext: `Pay once and it's all open — every idea published so far, and every
  one we publish after. No second charge, ever.`
- ctaAuthenticated: `Unlock everything` (e2e literal updated to import the constant)
- ctaSignedOut, pendingMessage, errorMessage: unchanged

### IDEAS_PAGE
- title: `Ideas people are asking for`
- subhead: `Pulled from Hacker News, GitHub, and Stack Exchange. Every one scored
  and sourced. New ideas every month.`
- lockedCountSuffix unchanged

### IDEA_DETAIL
- lockedMessage: `This idea is locked. One payment opens the demand evidence,
  sources, MRR estimate, and validation signals — here, and on every other idea,
  including the ones we haven't published yet.`
- headings unchanged

### LOGIN
- headline: `See who's asking, and what they're asking for.`
- bullet 1 body: `Real people, real complaints — who asked, and how many.`
- bullet 3 body: `One payment covers every idea live today and every idea we add after.`
- welcomeLede: `Continue with your Google account to open the full database.`
- offer, cta, reassurance: unchanged

### PRICING_SECTION
- title: `R$110. Once. Everything.`
- tiers and terms unchanged (legally load-bearing)

### FAQ
- "Are ideas exclusive to me?" answer: `No. Everyone who pays sees the same list.
  You're paying for the evidence, not exclusivity — the edge is in moving first.`
- all other items unchanged

### FINAL_CTA
- title: `The demand is already out there. It's just sitting in other people's posts.`
- body: `5 ideas are free. No account, no card — go look.`
- cta: `Show me the ideas`

### METADATA (new constant in content.ts, consumed by layout.tsx)
- title default: `NextBigIdea — Products people are already asking for`
- title template: `%s · NextBigIdea` (unchanged)
- description: `We read public posts on Hacker News, GitHub, and Stack Exchange
  for people describing products that don't exist yet — then score the demand and
  link every idea back to the posts that prove it.`
- og/twitter title: `Products people are already asking for`
- og/twitter description: `Scored, sourced demand signals from Hacker News,
  GitHub, and Stack Exchange. Every idea links back to the posts behind it.`
- og image alt: `NextBigIdea — scored SaaS ideas with links to the posts that
  prove demand` (unchanged)

## Architecture

1. **All changed strings live in `lib/content.ts`.** No copy is hardcoded in
   components; existing constant names and shapes are preserved so no component
   changes are needed.
2. **New `METADATA` constant in `content.ts`**, imported by `app/layout.tsx`.
   Because `content.test.ts` recursively collects every string in the module,
   the banned-source rule (reddit, product hunt, …) and banned-word list now
   cover metadata automatically — the class of bug being fixed here can't recur.
3. **e2e `purchase.spec.ts`** switches the four `"Unlock now"` literals to
   `PAYWALL_CTA.ctaAuthenticated` imported from `lib/content`.

## Testing

- `pnpm vitest run lib/content.test.ts` (or the repo's equivalent) must pass —
  it is the enforcement mechanism for every constraint above.
- e2e purchase spec compiles against the imported constant; no behavioral change.

## Out of scope

- Legal pages (terms, privacy) — tone stays formal; the "every idea" phrasing
  there is contractual, not marketing.
- Visual/layout changes. This is copy only.
- SAMPLE_IDEAS / SAMPLE_POSTS hero-animation data — unchanged.
