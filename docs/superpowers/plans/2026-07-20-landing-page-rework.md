# Landing Page Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 35-line placeholder landing page with a complete, animated, dark-only SaaS marketing page, and add Terms of Service and Privacy Policy pages.

**Architecture:** A thin `app/page.tsx` composes eleven section components from `components/sections/`. All copy lives in `lib/content.ts` so it is reviewable without reading JSX. Marketing statistics are derived from the database rather than hardcoded, using the repo's established pure-function/DB-caller split (`computeAccess` / `getViewerAccess`). Only the hero, nav, FAQ, and stat counter are client components; the remaining sections are server components.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.4, Tailwind v4 (CSS-first, no config file), shadcn/ui `aria-nova` on react-aria-components, hugeicons, `motion` v12 (new dependency), Drizzle ORM, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-20-landing-page-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Dark mode only.** `dark` is hardcoded on `<html>`. `next-themes` is removed from `apps/web`. Never add a theme toggle or a light-mode branch.
- **Sources are exactly three:** Reddit, Hacker News, Product Hunt. Never mention X, Twitter, or LinkedIn in customer-facing copy.
- **Price is `R$110/year`.** USD may appear only as a parenthetical `(≈US$20)`, never as the headline price.
- **Cadence:** we *scan* weekly, we *publish* monthly. Never write "new ideas weekly".
- **No invented social proof.** No testimonials, no logo walls, no user counts, no "trusted by" or "loved by" phrasing. If a number is not derived from the database, it does not appear.
- **Banned copy words** (enforced by test in Task 3): `powerful`, `seamless`, `supercharge`, `unlock the power`, `game-changing`, `revolutionary`, `cutting-edge`, `best-in-class`, `trusted by`, `loved by`, `lifetime`, `forever`, `weekly cadence`.
- **Animation:** `transform` and `opacity` only. No animating layout-affecting properties.
- **Reduced motion:** every animated component renders a *composed final state* under `prefers-reduced-motion`, never an empty stage.
- **Content is never hidden pending animation.** With JS disabled the page must be fully readable.
- **Next 16 APIs differ from training data.** Before using any Next caching, metadata, or routing API, read `node_modules/next/dist/docs/01-app/*`. Do not assume `unstable_cache` exists.
- **Paywall safety:** `components/locked-teaser.tsx` takes the branded `TeaserIdea` type. Restyling is fine; **widening its prop type to `Idea` is a paywall bypass and must never be done.**
- **Tests:** Vitest runs in `node` environment and only collects `lib/**/*.test.ts` (`apps/web/vitest.config.ts`). Put testable logic in `lib/` as pure functions. Do not add jsdom or component testing.
- **Legal constants** are interpolated from `lib/content.ts`. Never hardcode a company name, CNPJ, or email in JSX.

## File Structure

**New — logic**
- `apps/web/lib/content.ts` — all marketing copy + legal constants
- `apps/web/lib/content.test.ts` — copy-lint tests
- `apps/web/lib/stats.ts` — pure `applyStatsFloor`
- `apps/web/lib/stats.test.ts`
- `apps/web/lib/landing-stats.ts` — DB-backed `getLandingStats`

**New — chrome & primitives**
- `apps/web/components/section.tsx` — `Section`, `Eyebrow`, `SectionHeading`
- `apps/web/components/site-header.tsx`
- `apps/web/components/site-footer.tsx`
- `apps/web/components/legal/legal-page.tsx`

**New — sections**
- `apps/web/components/sections/hero.tsx`
- `apps/web/components/sections/hero-animation.tsx` *(client)*
- `apps/web/components/sections/proof-bar.tsx`
- `apps/web/components/sections/stat-counter.tsx` *(client)*
- `apps/web/components/sections/problem.tsx`
- `apps/web/components/sections/how-it-works.tsx`
- `apps/web/components/sections/anatomy.tsx`
- `apps/web/components/sections/why-evidence.tsx`
- `apps/web/components/sections/pricing.tsx`
- `apps/web/components/sections/faq.tsx` *(client)*
- `apps/web/components/sections/final-cta.tsx`

**New — routes**
- `apps/web/app/terms/page.tsx`
- `apps/web/app/privacy/page.tsx`
- `apps/web/app/robots.ts`
- `apps/web/app/sitemap.ts`

**Modified**
- `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`
- `apps/web/components/theme-provider.tsx` *(deleted)*
- `packages/ui/src/styles/globals.css`
- `apps/web/app/ideas/page.tsx`, `apps/web/app/ideas/[slug]/page.tsx`, `apps/web/app/account/page.tsx`, `apps/web/app/admin/page.tsx`
- `apps/web/components/paywall-cta.tsx`
- `apps/web/lib/payments/abacatepay.ts`, `apps/web/lib/payments/provider.ts`

---

### Task 1: Dark-only migration

Retires `next-themes` from the web app, hardcodes `dark`, collapses the light token block, and removes the dead `Geist` import.

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Delete: `apps/web/components/theme-provider.tsx`
- Modify: `packages/ui/src/styles/globals.css:53-120`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: nothing
- Produces: a `<html class="dark">` document. All later tasks assume dark tokens are the only tokens.

- [ ] **Step 1: Find every consumer of the theme provider**

```bash
cd /Users/gabe/www/personal/next.bigthing/.claude/worktrees/feat+landing-page-rework
grep -rn "theme-provider\|next-themes\|useTheme" apps/web --include=*.tsx --include=*.ts
```

Expected: hits in `app/layout.tsx` and `components/theme-provider.tsx` only. **If any other file appears, stop and report it** — it needs handling before deletion.

- [ ] **Step 2: Rewrite the root layout**

Replace the entire contents of `apps/web/app/layout.tsx`:

```tsx
import type { Metadata } from "next"
import { Geist_Mono, Figtree } from "next/font/google"

import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "NextBigThing",
  description:
    "SaaS ideas sourced from people who are already asking for them, scored and linked back to the posts that prove demand.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn("dark antialiased", fontMono.variable, "font-sans", figtree.variable)}
    >
      <body>{children}</body>
    </html>
  )
}
```

Note: `suppressHydrationWarning` is dropped — it existed only because `next-themes` mutated the class on the client. Full metadata lands in Task 10.

- [ ] **Step 3: Delete the theme provider**

```bash
rm apps/web/components/theme-provider.tsx
```

This removes the `d` keypress theme hotkey. That is intended and was confirmed by the user.

- [ ] **Step 4: Collapse the light tokens**

In `packages/ui/src/styles/globals.css`, the `:root` block (lines 53–86) currently holds light values and `.dark` (lines 88–120) holds dark values. Replace **both blocks** with a single `:root` carrying the dark values, keeping `--radius` which only existed in `:root`:

```css
:root {
    --background: oklch(0.141 0.005 285.823);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.21 0.006 285.885);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.21 0.006 285.885);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.432 0.095 166.913);
    --primary-foreground: oklch(0.979 0.021 166.113);
    --secondary: oklch(0.274 0.006 286.033);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.274 0.006 286.033);
    --muted-foreground: oklch(0.705 0.015 286.067);
    --accent: oklch(0.274 0.006 286.033);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.552 0.016 285.938);
    --chart-1: oklch(0.845 0.143 164.978);
    --chart-2: oklch(0.696 0.17 162.48);
    --chart-3: oklch(0.596 0.145 163.225);
    --chart-4: oklch(0.508 0.118 165.612);
    --chart-5: oklch(0.432 0.095 166.913);
    --radius: 0.625rem;
    --sidebar: oklch(0.21 0.006 285.885);
    --sidebar-foreground: oklch(0.985 0 0);
    --sidebar-primary: oklch(0.696 0.17 162.48);
    --sidebar-primary-foreground: oklch(0.262 0.051 172.552);
    --sidebar-accent: oklch(0.274 0.006 286.033);
    --sidebar-accent-foreground: oklch(0.985 0 0);
    --sidebar-border: oklch(1 0 0 / 10%);
    --sidebar-ring: oklch(0.552 0.016 285.938);
}
```

**Keep `@custom-variant dark (&:is(.dark *));` on line 5.** shadcn components ship `dark:` utilities; since `<html>` always carries `.dark`, those variants stay active. Removing it would silently change component rendering.

- [ ] **Step 5: Drop the dependency**

```bash
pnpm remove next-themes --filter web
```

`packages/ui` keeps its own `next-themes` dependency — do not touch it; shadcn components there may import from it.

- [ ] **Step 6: Verify build and typecheck**

```bash
pnpm --filter web typecheck
pnpm --filter web build
```

Expected: typecheck reports **only** the known pre-existing failure `lib/viewer-access.ts(20,23): error TS2554: Expected 2 arguments, but got 1`. Any other error is caused by this task and must be fixed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/package.json packages/ui/src/styles/globals.css pnpm-lock.yaml
git rm --cached apps/web/components/theme-provider.tsx 2>/dev/null || true
git add -A apps/web/components
git commit -m "feat(web): go dark-only and retire next-themes"
```

---

### Task 2: Content and legal constants

Single source of truth for every string on the marketing and legal pages.

**Files:**
- Create: `apps/web/lib/content.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `COMPANY: { name, legalName, cnpj, email, governingLaw, jurisdictionForum, lastUpdated }`
  - `PRICING: { amountBRL: string, amountUSDApprox: string, term: string, freeIdeaCount: number }`
  - `SOURCES: readonly { name: string; color: string }[]` — exactly 3
  - `HERO: { headline, subhead, primaryCta, primaryHref, secondaryCta, secondaryHref }`
  - `PROBLEM`, `HOW_IT_WORKS`, `ANATOMY`, `WHY_EVIDENCE`, `PRICING_SECTION`, `FAQ`, `FINAL_CTA`, `FOOTER`
  - `SAMPLE_POSTS: readonly string[]`, `SAMPLE_IDEAS: readonly SampleIdea[]` — illustrative hero animation data
  - `type SampleIdea = { title: string; score: number; asks: number; mrr: string; evidence: string }`

- [ ] **Step 1: Create the content module**

Create `apps/web/lib/content.ts`:

```ts
// Single source of truth for marketing and legal copy.
//
// Copy rules enforced by lib/content.test.ts:
//   - no banned marketing adjectives or invented social proof
//   - exactly three sources (Reddit, Hacker News, Product Hunt)
//   - price is stated in BRL; USD only ever as a parenthetical
//   - we scan weekly, we publish monthly — never "new ideas weekly"

export const COMPANY = {
  name: "NextBigThing",
  legalName: "GABRIEL CAMPOS DOS SANTOS P DE CARVALHO LTDA",
  cnpj: "58.378.419/0001-61",
  email: "gabrielccarvalhopro@gmail.com",
  governingLaw: "the Federative Republic of Brazil",
  jurisdictionForum: "the Comarca de São Paulo/SP",
  lastUpdated: "July 20, 2026",
} as const;

export const PRICING = {
  amountBRL: "R$110",
  amountUSDApprox: "≈US$20",
  term: "year",
  freeIdeaCount: 5,
  refundDays: 7,
} as const;

export const SOURCES = [
  { name: "Reddit", color: "#ff4500" },
  { name: "Hacker News", color: "#ff6600" },
  { name: "Product Hunt", color: "#da552f" },
] as const;

export const HERO = {
  eyebrow: "Evidence, not brainstorms",
  headline: "Every idea here has someone asking for it.",
  subhead:
    "Every week we read public posts across Reddit, Hacker News, and Product Hunt looking for people describing a product that doesn't exist yet — then score the strongest signals and link each one back to the posts that prove it. Nobody's built them yet.",
  primaryCta: "Browse the ideas",
  primaryHref: "/ideas",
  secondaryCta: "See how it works",
  secondaryHref: "#how-it-works",
} as const;

export const PROBLEM = {
  eyebrow: "Why most side projects die",
  title: "Building something nobody asked for is the default outcome.",
  body: "You can ship fast, write clean code, and still spend six months on a product with no demand behind it. The hard part was never the building. It's knowing what's worth building.",
} as const;

export const HOW_IT_WORKS = {
  eyebrow: "How it works",
  title: "Demand goes in. Scored ideas come out.",
  steps: [
    {
      n: "01",
      title: "Scan",
      body: "Every week we pull public posts from Reddit, Hacker News, and Product Hunt.",
    },
    {
      n: "02",
      title: "Cluster & score",
      body: "Posts describing the same missing product get grouped, scored for demand, and sized for revenue.",
    },
    {
      n: "03",
      title: "You build",
      body: "You get the idea, the numbers behind it, and links to every post that produced it.",
    },
  ],
} as const;

export const ANATOMY = {
  eyebrow: "What you get",
  title: "Anatomy of an idea.",
  intro: "Every entry carries the same evidence, so you can judge it the way you'd judge your own research.",
  callouts: [
    { label: "Demand score", body: "0–100, derived from how many people asked and how strongly." },
    { label: "Ask count", body: "How many distinct posts describe this missing product." },
    { label: "Estimated MRR", body: "A range derived from comparable products — shown as a range, because it is one." },
    { label: "Competition notes", body: "What already exists, and where it falls short of what people asked for." },
    { label: "Validation signals", body: "The specific phrases that indicate willingness to pay." },
    { label: "Source links", body: "Every post behind the idea, linked. Go read them yourself." },
  ],
  closer: "Every number here traces back to a post you can go read yourself.",
} as const;

export const WHY_EVIDENCE = {
  eyebrow: "Why evidence wins",
  title: "Why not just ask an AI for fifty ideas?",
  intro: "You can. You'll get fifty plausible sentences. Here's the difference.",
  rows: [
    { generated: "Plausible-sounding ideas invented on demand", ours: "Ideas extracted from posts real people wrote" },
    { generated: "No way to tell if anyone wants it", ours: "Ask counts from named sources" },
    { generated: "Confident revenue guesses", ours: "Ranges derived from comparable products, shown as ranges" },
    { generated: "Unfalsifiable", ours: "Every claim links to the post behind it" },
  ],
  generatedLabel: "Generated idea lists",
  oursLabel: "NextBigThing",
} as const;

export const PRICING_SECTION = {
  eyebrow: "Pricing",
  title: "One plan. Cancel whenever.",
  free: {
    name: "Free",
    price: "R$0",
    items: [
      "5 ideas, chosen by us",
      "Full detail on those 5",
      "No account required",
    ],
  },
  paid: {
    name: "Full access",
    items: [
      "Every idea published so far",
      "Every idea published while your access is active",
      "Source links on every idea",
      "New ideas every month",
    ],
    cta: "Get full access",
  },
  terms: [
    "Renews annually until you cancel.",
    "Cancel any time — access continues to the end of the paid period.",
    "Card payments only.",
    "7-day refund on your first purchase.",
  ],
} as const;

export const FAQ = {
  eyebrow: "Questions",
  title: "Before you buy.",
  items: [
    {
      q: "How often do new ideas appear?",
      a: "New ideas are added every month. We scan sources every week, but we only publish once we have enough signal to score an idea properly.",
    },
    {
      q: "What happens when my access expires?",
      a: "You go back to the 5 free ideas. Nothing is deleted, and resubscribing restores everything immediately.",
    },
    {
      q: "Can I cancel?",
      a: "Yes, any time. Your access continues until the end of the period you already paid for.",
    },
    {
      q: "Do you offer refunds?",
      a: "Yes — 7 days on your first purchase, no questions asked.",
    },
    {
      q: "Are ideas exclusive to me?",
      a: "No. Every subscriber sees the same ideas. What you're paying for is the evidence, not exclusivity.",
    },
    {
      q: "Where do the ideas come from?",
      a: "Public posts on Reddit, Hacker News, and Product Hunt. Every idea links back to the posts it came from.",
    },
    {
      q: "Do you validate the ideas yourselves?",
      a: "No. We measure what people are asking for. We don't judge whether a business will work — that part is yours.",
    },
  ],
} as const;

export const FINAL_CTA = {
  title: "Stop guessing. Go read what people are asking for.",
  body: "5 ideas are free. No account needed to look around.",
  cta: "Browse the ideas",
  href: "/ideas",
} as const;

export const FOOTER = {
  columns: [
    {
      heading: "Product",
      links: [
        { label: "Ideas", href: "/ideas" },
        { label: "How it works", href: "/#how-it-works" },
        { label: "Pricing", href: "/#pricing" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Terms of Service", href: "/terms" },
        { label: "Privacy Policy", href: "/privacy" },
      ],
    },
    {
      heading: "Contact",
      links: [{ label: COMPANY.email, href: `mailto:${COMPANY.email}` }],
    },
  ],
} as const;

// --- Illustrative data for the hero animation ---
// These are plausible paraphrases, NOT quotations of specific real posts.

export type SampleIdea = {
  title: string;
  score: number;
  asks: number;
  mrr: string;
  evidence: string;
};

export const SAMPLE_IDEAS: readonly SampleIdea[] = [
  {
    title: "Invoice autopilot",
    score: 94,
    asks: 47,
    mrr: "$2–6k",
    evidence: "Six tools tried, none of them just send the invoice.",
  },
  {
    title: "Handoff notes",
    score: 88,
    asks: 31,
    mrr: "$1–4k",
    evidence: "Context disappears every time someone leaves the team.",
  },
] as const;

export const SAMPLE_POSTS: readonly string[] = [
  "why is there no tool that just emails the invoice?",
  "I'd pay monthly for this, does it exist?",
  "tried six apps, none do the one thing I need",
  "we gave up and built a spreadsheet instead",
  "I keep doing this manually every week",
  "surely this exists already? I can't find it",
  "context is lost every time someone leaves",
  "onboarding a new dev takes three weeks",
  "our wiki is a graveyard",
] as const;
```

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm --filter web typecheck
```

Expected: only the known pre-existing `viewer-access.ts` error.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/content.ts
git commit -m "feat(web): add marketing and legal content constants"
```

---

### Task 3: Copy-lint tests

Turns the spec's trust constraints into executable rules, so a future edit that reintroduces "lifetime" or invents social proof fails CI.

**Files:**
- Create: `apps/web/lib/content.test.ts`

**Interfaces:**
- Consumes: everything exported by `lib/content.ts`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as content from "./content";
import { COMPANY, PRICING, SOURCES } from "./content";

// Recursively collect every string in the content module so a new section
// can't opt out of these rules by being added later.
function allStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, acc));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => allStrings(v, acc));
  }
  return acc;
}

const CORPUS = allStrings(content).join("\n").toLowerCase();

describe("copy rules", () => {
  const BANNED = [
    "powerful",
    "seamless",
    "supercharge",
    "unlock the power",
    "game-changing",
    "revolutionary",
    "cutting-edge",
    "best-in-class",
    "trusted by",
    "loved by",
    "lifetime",
    "forever",
    "weekly cadence",
  ];

  it.each(BANNED)("does not contain the banned phrase %s", (phrase) => {
    expect(CORPUS).not.toContain(phrase);
  });

  it("never claims new ideas arrive weekly", () => {
    expect(CORPUS).not.toMatch(/new ideas[^.]{0,20}week/);
    expect(CORPUS).not.toMatch(/ideas (every|each) week/);
  });

  it("does not mention unverified sources", () => {
    for (const forbidden of ["linkedin", "twitter"]) {
      expect(CORPUS).not.toContain(forbidden);
    }
    // "X" is too short to grep safely; assert the source list instead.
    expect(SOURCES.map((s) => s.name)).toEqual([
      "Reddit",
      "Hacker News",
      "Product Hunt",
    ]);
  });
});

describe("pricing", () => {
  it("states the price in BRL", () => {
    expect(PRICING.amountBRL).toBe("R$110");
    expect(PRICING.term).toBe("year");
  });

  it("marks the USD figure as approximate", () => {
    expect(PRICING.amountUSDApprox).toMatch(/^≈/);
  });

  it("never presents a bare USD price anywhere in the copy", () => {
    // A "$20" not preceded by ≈ would read as the actual charge.
    expect(CORPUS).not.toMatch(/(?<!≈)(?<!us)\$20\b/);
  });
});

describe("legal constants", () => {
  it("has every field populated", () => {
    for (const [key, value] of Object.entries(COMPANY)) {
      expect(value, `COMPANY.${key} must not be empty`).toBeTruthy();
      expect(typeof value).toBe("string");
    }
  });

  it("has a well-formed CNPJ", () => {
    expect(COMPANY.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
  });

  it("has a plausible contact email", () => {
    expect(COMPANY.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes against Task 2's content**

```bash
pnpm --filter web test
```

Expected: PASS. **If any banned-phrase test fails, the fix is to change `lib/content.ts`, never to weaken the test.**

- [ ] **Step 3: Prove the test actually bites**

Temporarily append to `apps/web/lib/content.ts`:

```ts
export const TEMP_CHECK = "our powerful platform is loved by thousands";
```

```bash
pnpm --filter web test
```

Expected: FAIL on `powerful` and `loved by`. Then **remove `TEMP_CHECK`** and re-run to confirm PASS. This step exists because a copy-lint that silently matches nothing is worse than no test at all.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/content.test.ts
git commit -m "test(web): enforce marketing copy trust rules"
```

---

### Task 4: Derived statistics

Pure floor logic plus a DB-backed caller, mirroring the repo's existing `computeAccess` / `getViewerAccess` split.

**Files:**
- Create: `apps/web/lib/stats.ts`
- Create: `apps/web/lib/stats.test.ts`
- Create: `apps/web/lib/landing-stats.ts`

**Interfaces:**
- Consumes: `db`, `ideas`, `rawPosts` from `@workspace/db`
- Produces:
  - `type RawStats = { ideasPublished: number; postsScanned: number; postsLastWeek: number }`
  - `type LandingStats = RawStats & { sources: number }`
  - `applyStatsFloor(raw: RawStats): LandingStats | null`
  - `getLandingStats(): Promise<LandingStats | null>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyStatsFloor, STATS_FLOOR } from "./stats";

describe("applyStatsFloor", () => {
  const healthy = { ideasPublished: 120, postsScanned: 40_000, postsLastWeek: 2_100 };

  it("returns the stats with a fixed source count when above the floor", () => {
    expect(applyStatsFloor(healthy)).toEqual({ ...healthy, sources: 3 });
  });

  it("returns null when too few ideas are published", () => {
    expect(
      applyStatsFloor({ ...healthy, ideasPublished: STATS_FLOOR.ideasPublished - 1 }),
    ).toBeNull();
  });

  it("returns null when too few posts have been scanned", () => {
    expect(
      applyStatsFloor({ ...healthy, postsScanned: STATS_FLOOR.postsScanned - 1 }),
    ).toBeNull();
  });

  it("renders at exactly the floor", () => {
    const atFloor = {
      ideasPublished: STATS_FLOOR.ideasPublished,
      postsScanned: STATS_FLOOR.postsScanned,
      postsLastWeek: 0,
    };
    expect(applyStatsFloor(atFloor)).not.toBeNull();
  });

  it("reports three sources regardless of what the database contains", () => {
    // Guards the trust rule: a stray best-effort X/LinkedIn row must never
    // cause the page to start claiming more sources than we actually cover.
    expect(applyStatsFloor(healthy)?.sources).toBe(3);
  });

  it("allows zero posts in the last week without hiding the section", () => {
    // The pipeline runs weekly; a missed run must not blank the proof bar.
    expect(applyStatsFloor({ ...healthy, postsLastWeek: 0 })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm --filter web test stats
```

Expected: FAIL — `Failed to resolve import "./stats"`.

- [ ] **Step 3: Write the pure implementation**

Create `apps/web/lib/stats.ts`:

```ts
export type RawStats = {
  ideasPublished: number;
  postsScanned: number;
  postsLastWeek: number;
};

export type LandingStats = RawStats & { sources: number };

// Below these numbers the proof bar undersells the product, so we hide it
// entirely. An absent stat bar reads as neutral; a weak one reads as evidence
// that there isn't much here.
export const STATS_FLOOR = {
  ideasPublished: 25,
  postsScanned: 2_000,
} as const;

// Deliberately a constant, NOT count(distinct raw_posts.source). The pipeline
// scrapes X and LinkedIn best-effort, and we do not claim them. Deriving this
// would silently start advertising sources we don't reliably cover the moment
// a single stray row landed.
const CLAIMED_SOURCES = 3;

export function applyStatsFloor(raw: RawStats): LandingStats | null {
  if (raw.ideasPublished < STATS_FLOOR.ideasPublished) return null;
  if (raw.postsScanned < STATS_FLOOR.postsScanned) return null;
  return { ...raw, sources: CLAIMED_SOURCES };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter web test stats
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the DB caller**

Create `apps/web/lib/landing-stats.ts`:

```ts
import { db, ideas, rawPosts } from "@workspace/db";
import { count, eq, gte, sql } from "drizzle-orm";
import { applyStatsFloor, type LandingStats } from "./stats";

// Kept separate from stats.ts so the floor logic stays unit-testable without a
// database, matching the computeAccess / getViewerAccess split in this codebase.
export async function getLandingStats(): Promise<LandingStats | null> {
  const [published, scanned, lastWeek] = await Promise.all([
    db.select({ n: count() }).from(ideas).where(eq(ideas.status, "published")),
    db.select({ n: count() }).from(rawPosts),
    db
      .select({ n: count() })
      .from(rawPosts)
      .where(gte(rawPosts.fetchedAt, sql`now() - interval '7 days'`)),
  ]);

  return applyStatsFloor({
    ideasPublished: published[0]?.n ?? 0,
    postsScanned: scanned[0]?.n ?? 0,
    postsLastWeek: lastWeek[0]?.n ?? 0,
  });
}
```

- [ ] **Step 6: Add caching using the current Next 16 API**

**Do not guess the API.** Read the local docs first:

```bash
ls node_modules/next/dist/docs/01-app/
grep -rl "use cache\|unstable_cache" node_modules/next/dist/docs/01-app/ | head
```

Then wrap `getLandingStats` with the caching mechanism those docs describe, targeting a ~1 hour revalidation window. If the docs show the `use cache` directive, prefer it. Record which API you used in the commit message so a reviewer can verify it.

- [ ] **Step 7: Verify typecheck**

```bash
pnpm --filter web typecheck
```

Expected: only the known pre-existing `viewer-access.ts` error.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/stats.ts apps/web/lib/stats.test.ts apps/web/lib/landing-stats.ts
git commit -m "feat(web): derive landing statistics from the database"
```

---

### Task 5: Section primitives, header, and footer

Shared chrome. Every later section builds on these.

**Files:**
- Create: `apps/web/components/section.tsx`
- Create: `apps/web/components/site-header.tsx`
- Create: `apps/web/components/site-footer.tsx`

**Interfaces:**
- Consumes: `FOOTER`, `COMPANY`, `HERO` from `lib/content.ts`; `cn` from `@workspace/ui/lib/utils`
- Produces:
  - `<Section id?: string, className?: string, children>` 
  - `<Eyebrow>{string}</Eyebrow>`
  - `<SectionHeading eyebrow?: string, title: string, intro?: string, align?: "left" | "center">`
  - `<SiteHeader />`, `<SiteFooter />`

- [ ] **Step 1: Create the section primitives**

Create `apps/web/components/section.tsx`:

```tsx
import { cn } from "@workspace/ui/lib/utils";

export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-28", className)}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-primary">
      <span aria-hidden className="h-px w-6 bg-primary/60" />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("flex flex-col gap-4", align === "center" && "items-center text-center")}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {intro ? (
        <p className={cn("max-w-2xl text-pretty text-muted-foreground", align === "center" && "mx-auto")}>
          {intro}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Create the site header**

Create `apps/web/components/site-header.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { COMPANY } from "@/lib/content";

const NAV = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300",
        scrolled && "border-b border-border bg-background/80 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          {COMPANY.name}
        </Link>
        <nav className="ml-auto hidden items-center gap-6 sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/ideas"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Browse ideas
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create the site footer**

Create `apps/web/components/site-footer.tsx`:

```tsx
import Link from "next/link";
import { COMPANY, FOOTER } from "@/lib/content";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-3">
          {FOOTER.columns.map((col) => (
            <div key={col.heading}>
              <h3 className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-2">
                {col.links.map((link) => {
                  const external = link.href.startsWith("http");
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-border pt-6">
          <p className="font-mono text-[0.65rem] leading-relaxed text-muted-foreground">
            {COMPANY.name} is operated by {COMPANY.legalName} (CNPJ {COMPANY.cnpj}).
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter web typecheck
```

Expected: only the known pre-existing `viewer-access.ts` error.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/section.tsx apps/web/components/site-header.tsx apps/web/components/site-footer.tsx
git commit -m "feat(web): add shared section primitives, header, and footer"
```

---

### Task 6: Hero animation

The converge-and-condense animation, ported from the approved prototype.

**Files:**
- Create: `apps/web/components/sections/hero-animation.tsx`
- Modify: `apps/web/package.json` (add `motion`)

**Interfaces:**
- Consumes: `SOURCES`, `SAMPLE_POSTS`, `SAMPLE_IDEAS`, `type SampleIdea` from `lib/content.ts`
- Produces: `<HeroAnimation />` — self-contained, no props

**Behaviour contract** (from the spec, approved from a working prototype):

| Phase | Duration | Behaviour |
|---|---|---|
| Gather | ~3.4s | Posts arrive from a full 360°, jittered, drifting inward, readable |
| Condense | ~1.1s | Posts accelerate to centre, shrink, blur, vanish into a glowing core |
| Form | ~0.8s | Core flares, shockwave ring expands, card unfolds from the same point |
| Hold | ~3.2s | Score counts up, card static and readable, then recedes |

Hard requirements: nothing exits the frame; the card is born at the collapse coordinates; `transform`/`opacity` only; reduced motion renders the finished card.

- [ ] **Step 1: Add the dependency**

```bash
pnpm add motion --filter web
```

- [ ] **Step 2: Create the animation component**

Create `apps/web/components/sections/hero-animation.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { SAMPLE_IDEAS, SAMPLE_POSTS, SOURCES, type SampleIdea } from "@/lib/content";

const GATHER_MS = 3400;
const CONDENSE_MS = 1000;
const FORM_AT = 4400;
const RECEDE_AT = 8200;
const CYCLE_MS = 9100;

type Phase = "gathering signals" | "condensing" | "scored idea";

export function HeroAnimation() {
  const stageRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);

  const [idea, setIdea] = useState<SampleIdea>(SAMPLE_IDEAS[0]!);
  const [phase, setPhase] = useState<Phase>("gathering signals");
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    // NOTE: this effect must depend on [reduced] ONLY. It calls setIdea() on
    // every cycle; if `idea` were a dependency the effect would tear itself
    // down and restart on each cycle, producing an infinite restart loop.
    // Read the current idea from SAMPLE_IDEAS inside the closure instead.

    // Reduced motion renders the composed final state: a finished card with a
    // real score. Never an empty stage.
    if (reduced) {
      const first = SAMPLE_IDEAS[0]!;
      setIdea(first);
      setPhase("scored idea");
      if (scoreRef.current) scoreRef.current.textContent = String(first.score);
      if (cardRef.current) cardRef.current.style.opacity = "1";
      return;
    }

    const stage = stageRef.current;
    const core = coreRef.current;
    const ring = ringRef.current;
    const card = cardRef.current;
    if (!stage || !core || !ring || !card) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const spawned: HTMLElement[] = [];
    let cancelled = false;
    let cycleIndex = 0;

    const after = (fn: () => void, ms: number) => {
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    };

    const spawnPost = (text: string, i: number, total: number) => {
      const source = SOURCES[i % SOURCES.length]!;
      const angle = (i / total) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const rx = Math.max(stage.clientWidth * 0.6, 300) + Math.random() * 70;
      const ry = Math.max(stage.clientHeight * 0.7, 220) + Math.random() * 50;
      const x0 = Math.cos(angle) * rx;
      const y0 = Math.sin(angle) * ry;
      const rot = (Math.random() - 0.5) * 16;

      const el = document.createElement("div");
      el.className =
        "absolute left-1/2 top-1/2 -ml-[88px] -mt-5 w-44 rounded-lg border border-border " +
        "bg-card px-2.5 py-2 shadow-lg will-change-transform";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML =
        `<div class="mb-1 flex items-center gap-1.5 font-mono text-[0.5rem] uppercase tracking-[0.13em] text-muted-foreground">` +
        `<span class="size-1.5 shrink-0 rounded-full" style="background:${source.color}"></span>${source.name}</div>` +
        `<div class="text-[0.6rem] leading-snug text-muted-foreground"></div>`;
      // textContent, not innerHTML, so sample copy can never inject markup.
      el.lastElementChild!.textContent = text;
      stage.appendChild(el);
      spawned.push(el);

      const delay = i * 190 + Math.random() * 90;

      el.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) rotate(${rot}deg) scale(.86)`, opacity: 0 },
          { offset: 0.28, transform: `translate(${x0 * 0.8}px, ${y0 * 0.8}px) rotate(${rot * 0.7}deg) scale(1)`, opacity: 1 },
          { transform: `translate(${x0 * 0.42}px, ${y0 * 0.42}px) rotate(${rot * 0.35}deg) scale(.97)`, opacity: 1 },
        ],
        { duration: 2600, delay, easing: "cubic-bezier(.22,.7,.35,1)", fill: "forwards" },
      );

      after(() => {
        el.animate(
          [
            { transform: `translate(${x0 * 0.42}px, ${y0 * 0.42}px) rotate(${rot * 0.35}deg) scale(.97)`, opacity: 1 },
            { offset: 0.55, transform: `translate(${x0 * 0.16}px, ${y0 * 0.16}px) scale(.55)`, opacity: 0.9 },
            { transform: "translate(0,0) scale(.06)", opacity: 0 },
          ],
          { duration: CONDENSE_MS, easing: "cubic-bezier(.55,0,.85,.35)", fill: "forwards" },
        );
      }, GATHER_MS);
    };

    const countUp = (target: number) => {
      const node = scoreRef.current;
      if (!node) return;
      const start = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const p = Math.min(1, (now - start) / 1100);
        node.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const cycle = () => {
      spawned.forEach((el) => el.remove());
      spawned.length = 0;

      const current = SAMPLE_IDEAS[cycleIndex % SAMPLE_IDEAS.length]!;
      cycleIndex += 1;
      setIdea(current);
      setPhase("gathering signals");
      card.style.opacity = "0";
      core.style.opacity = "0";
      ring.style.opacity = "0";

      SAMPLE_POSTS.forEach((text, i) => spawnPost(text, i, SAMPLE_POSTS.length));

      after(() => {
        setPhase("condensing");
        core.style.opacity = "1";
        core.animate(
          [{ transform: "scale(.2)", opacity: 0.2 }, { transform: "scale(1.5)", opacity: 1 }],
          { duration: CONDENSE_MS, easing: "ease-in", fill: "forwards" },
        );
      }, GATHER_MS);

      after(() => {
        core.animate(
          [{ transform: "scale(1.5)", opacity: 1 }, { transform: "scale(5)", opacity: 0 }],
          { duration: 520, easing: "ease-out", fill: "forwards" },
        );
        ring.style.opacity = "1";
        ring.animate(
          [{ transform: "scale(.3)", opacity: 0.9 }, { transform: "scale(9)", opacity: 0 }],
          { duration: 900, easing: "cubic-bezier(.1,.7,.3,1)", fill: "forwards" },
        );

        card.style.opacity = "1";
        card.animate(
          [
            { opacity: 0, transform: "scale(.42) translateY(6px)" },
            { offset: 0.6, opacity: 1, transform: "scale(1.04)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          { duration: 820, easing: "cubic-bezier(.2,.8,.25,1)", fill: "forwards" },
        );

        setPhase("scored idea");
        countUp(current.score);
      }, FORM_AT);

      after(() => {
        card.animate(
          [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.94)" }],
          { duration: 620, easing: "ease-in", fill: "forwards" },
        );
      }, RECEDE_AT);

      after(cycle, CYCLE_MS);
    };

    cycle();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      spawned.forEach((el) => el.remove());
    };
    // Intentionally [reduced] only — see the note at the top of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <div
      ref={stageRef}
      aria-hidden="true"
      className="relative h-[380px] overflow-hidden rounded-xl border border-border sm:h-[440px]"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 12%, var(--background)) 0%, var(--background) 62%)",
      }}
    >
      <span className="absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted-foreground">
        {phase}
      </span>

      <div
        ref={ringRef}
        className="absolute left-1/2 top-1/2 -ml-2.5 -mt-2.5 size-5 rounded-full border border-primary opacity-0 will-change-transform"
      />
      <div
        ref={coreRef}
        className="absolute left-1/2 top-1/2 -ml-1 -mt-1 size-2.5 rounded-full bg-primary opacity-0 will-change-transform"
        style={{ boxShadow: "0 0 22px 8px color-mix(in oklch, var(--primary) 50%, transparent)" }}
      />

      <div
        ref={cardRef}
        className="absolute left-1/2 top-1/2 -ml-[135px] -mt-[62px] w-[270px] rounded-xl border border-border bg-card p-4 opacity-0 shadow-2xl will-change-transform"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold tracking-tight">{idea.title}</span>
          <span className="text-right">
            <span ref={scoreRef} className="block font-mono text-xl font-semibold text-primary">
              0
            </span>
            <span className="block font-mono text-[0.5rem] uppercase tracking-[0.14em] text-muted-foreground">
              demand
            </span>
          </span>
        </div>
        <div className="mt-2 flex gap-3 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-muted-foreground">
          <span>{idea.asks} asks</span>
          <span>est. {idea.mrr} MRR</span>
        </div>
        <div className="my-2.5 h-px bg-border" />
        <p className="text-[0.65rem] italic leading-relaxed text-muted-foreground">{idea.evidence}</p>
        <p className="mt-2 font-mono text-[0.5rem] uppercase tracking-[0.13em] text-primary">
          built from {idea.asks} posts · {SOURCES.length} sources
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter web typecheck
```

Expected: only the known pre-existing `viewer-access.ts` error.

- [ ] **Step 4: Verify visually**

```bash
pnpm --filter web dev
```

Open `http://localhost:3000`. The component isn't mounted yet (Task 7), so nothing renders — **that is expected.** This step only confirms the dev server compiles the file without error. Watch the terminal for compilation errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/sections/hero-animation.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add converge-and-condense hero animation"
```

---

### Task 7: Hero, problem, and how-it-works sections

**Files:**
- Create: `apps/web/components/sections/hero.tsx`
- Create: `apps/web/components/sections/problem.tsx`
- Create: `apps/web/components/sections/how-it-works.tsx`

**Interfaces:**
- Consumes: `Section`, `SectionHeading`, `Eyebrow` from `components/section.tsx`; `HeroAnimation`; `HERO`, `PROBLEM`, `HOW_IT_WORKS` from `lib/content.ts`
- Produces: `<Hero />`, `<Problem />`, `<HowItWorks />`

- [ ] **Step 1: Create the hero**

Create `apps/web/components/sections/hero.tsx`:

```tsx
import Link from "next/link";
import { Eyebrow } from "@/components/section";
import { HeroAnimation } from "@/components/sections/hero-animation";
import { HERO } from "@/lib/content";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 sm:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col gap-6">
          <Eyebrow>{HERO.eyebrow}</Eyebrow>
          {/* This h1 must remain the LCP element — never let the animation take it. */}
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {HERO.headline}
          </h1>
          <p className="max-w-xl text-pretty text-muted-foreground">{HERO.subhead}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={HERO.primaryHref}
              className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {HERO.primaryCta} &rarr;
            </Link>
            <Link
              href={HERO.secondaryHref}
              className="rounded-md border border-border px-6 py-3 font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {HERO.secondaryCta}
            </Link>
          </div>
        </div>
        <HeroAnimation />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create the problem section**

Create `apps/web/components/sections/problem.tsx`:

```tsx
import { Section, SectionHeading } from "@/components/section";
import { PROBLEM } from "@/lib/content";

export function Problem() {
  return (
    <Section>
      <SectionHeading eyebrow={PROBLEM.eyebrow} title={PROBLEM.title} intro={PROBLEM.body} />
    </Section>
  );
}
```

- [ ] **Step 3: Create the how-it-works section**

Create `apps/web/components/sections/how-it-works.tsx`:

```tsx
import { Section, SectionHeading } from "@/components/section";
import { HOW_IT_WORKS } from "@/lib/content";

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading eyebrow={HOW_IT_WORKS.eyebrow} title={HOW_IT_WORKS.title} />
      <ol className="mt-12 grid gap-6 sm:grid-cols-3">
        {HOW_IT_WORKS.steps.map((step) => (
          <li key={step.n} className="rounded-xl border border-border bg-card p-6">
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-primary">
              {step.n}
            </span>
            <h3 className="mt-3 text-lg font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter web typecheck
```

Expected: only the known pre-existing `viewer-access.ts` error.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/sections/hero.tsx apps/web/components/sections/problem.tsx apps/web/components/sections/how-it-works.tsx
git commit -m "feat(web): add hero, problem, and how-it-works sections"
```

---

### Task 8: Proof bar, anatomy, and why-evidence sections

**Files:**
- Create: `apps/web/components/sections/stat-counter.tsx`
- Create: `apps/web/components/sections/proof-bar.tsx`
- Create: `apps/web/components/sections/anatomy.tsx`
- Create: `apps/web/components/sections/why-evidence.tsx`

**Interfaces:**
- Consumes: `getLandingStats` from `lib/landing-stats.ts`; `ANATOMY`, `WHY_EVIDENCE`, `SOURCES` from `lib/content.ts`
- Produces: `<ProofBar />` (async server component), `<StatCounter value: number, label: string />` (client), `<Anatomy />`, `<WhyEvidence />`

- [ ] **Step 1: Create the stat counter**

Create `apps/web/components/sections/stat-counter.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

export function StatCounter({ value, label }: { value: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Starts at the true value so the number is correct without JS and under
  // reduced motion. The animation only ever replays a value already rendered.
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / 1200);
          setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        };
        setDisplay(0);
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="rounded-xl border border-border bg-card p-6">
      <div className="font-mono text-3xl font-semibold tracking-tight text-primary tabular-nums">
        {display.toLocaleString("en-US")}
      </div>
      <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the proof bar**

Create `apps/web/components/sections/proof-bar.tsx`:

```tsx
import { Section } from "@/components/section";
import { StatCounter } from "@/components/sections/stat-counter";
import { getLandingStats } from "@/lib/landing-stats";

export async function ProofBar() {
  const stats = await getLandingStats();

  // Below the floor the section does not render at all. An absent stat bar is
  // neutral; a weak one actively undersells the product.
  if (!stats) return null;

  return (
    <Section className="py-12 sm:py-14">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCounter value={stats.postsScanned} label="posts read" />
        <StatCounter value={stats.ideasPublished} label="ideas published" />
        <StatCounter value={stats.sources} label="sources" />
      </div>
    </Section>
  );
}
```

- [ ] **Step 3: Create the anatomy section**

Create `apps/web/components/sections/anatomy.tsx`:

```tsx
import { Section, SectionHeading } from "@/components/section";
import { ANATOMY } from "@/lib/content";

export function Anatomy() {
  return (
    <Section id="anatomy">
      <SectionHeading eyebrow={ANATOMY.eyebrow} title={ANATOMY.title} intro={ANATOMY.intro} />
      <dl className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
        {ANATOMY.callouts.map((c) => (
          <div key={c.label} className="bg-card p-6">
            <dt className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-primary">
              {c.label}
            </dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-pretty text-lg font-medium">{ANATOMY.closer}</p>
    </Section>
  );
}
```

- [ ] **Step 4: Create the why-evidence section**

Create `apps/web/components/sections/why-evidence.tsx`:

```tsx
import { Section, SectionHeading } from "@/components/section";
import { WHY_EVIDENCE } from "@/lib/content";

export function WhyEvidence() {
  return (
    <Section>
      <SectionHeading
        eyebrow={WHY_EVIDENCE.eyebrow}
        title={WHY_EVIDENCE.title}
        intro={WHY_EVIDENCE.intro}
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-6">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
            {WHY_EVIDENCE.generatedLabel}
          </h3>
          <ul className="mt-4 space-y-3">
            {WHY_EVIDENCE.rows.map((r) => (
              <li key={r.generated} className="text-sm leading-relaxed text-muted-foreground">
                {r.generated}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-primary/40 bg-card p-6">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-primary">
            {WHY_EVIDENCE.oursLabel}
          </h3>
          <ul className="mt-4 space-y-3">
            {WHY_EVIDENCE.rows.map((r) => (
              <li key={r.ours} className="text-sm leading-relaxed">
                {r.ours}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 5: Verify typecheck**

```bash
pnpm --filter web typecheck
```

Expected: only the known pre-existing `viewer-access.ts` error.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/sections/stat-counter.tsx apps/web/components/sections/proof-bar.tsx apps/web/components/sections/anatomy.tsx apps/web/components/sections/why-evidence.tsx
git commit -m "feat(web): add proof bar, anatomy, and why-evidence sections"
```

---

### Task 9: Pricing, FAQ, and final CTA

**Files:**
- Create: `apps/web/components/sections/pricing.tsx`
- Create: `apps/web/components/sections/faq.tsx`
- Create: `apps/web/components/sections/final-cta.tsx`

**Interfaces:**
- Consumes: `PRICING`, `PRICING_SECTION`, `FAQ`, `FINAL_CTA` from `lib/content.ts`; `PaywallCta` from `components/paywall-cta.tsx`
- Produces: `<Pricing />`, `<Faq />`, `<FinalCta />`

- [ ] **Step 1: Create the pricing section**

Renewal terms appear **above** the CTA, in the visible page, not only in the ToS — Brazilian consumer law requires clear pre-purchase disclosure.

Create `apps/web/components/sections/pricing.tsx`:

```tsx
import { Section, SectionHeading } from "@/components/section";
import { PRICING, PRICING_SECTION } from "@/lib/content";
import { PaywallCta } from "@/components/paywall-cta";

export function Pricing() {
  return (
    <Section id="pricing">
      <SectionHeading
        eyebrow={PRICING_SECTION.eyebrow}
        title={PRICING_SECTION.title}
        align="center"
      />
      <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-8">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
            {PRICING_SECTION.free.name}
          </h3>
          <p className="mt-4 text-3xl font-bold tracking-tight">{PRICING_SECTION.free.price}</p>
          <ul className="mt-6 space-y-2">
            {PRICING_SECTION.free.items.map((item) => (
              <li key={item} className="text-sm text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-primary/50 bg-card p-8 shadow-[0_0_40px_-12px_var(--primary)]">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-primary">
            {PRICING_SECTION.paid.name}
          </h3>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">{PRICING.amountBRL}</span>
            <span className="text-muted-foreground">/{PRICING.term}</span>
          </p>
          <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
            {PRICING.amountUSDApprox}
          </p>
          <ul className="mt-6 space-y-2">
            {PRICING_SECTION.paid.items.map((item) => (
              <li key={item} className="text-sm">
                {item}
              </li>
            ))}
          </ul>

          {/* Renewal and cancellation terms are disclosed before purchase, not
              only in the Terms of Service. */}
          <ul className="mt-6 space-y-1 border-t border-border pt-4">
            {PRICING_SECTION.terms.map((term) => (
              <li key={term} className="text-[0.7rem] leading-relaxed text-muted-foreground">
                {term}
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <PaywallCta />
          </div>
        </div>
      </div>
    </Section>
  );
}
```

**If `PaywallCta` requires props**, read `apps/web/components/paywall-cta.tsx` and pass what it needs. Do not change its prop contract in this task — Task 12 handles its copy.

- [ ] **Step 2: Create the FAQ**

Uses native `<details>` so the content is readable and expandable with JS disabled.

Create `apps/web/components/sections/faq.tsx`:

```tsx
import { Section, SectionHeading } from "@/components/section";
import { FAQ } from "@/lib/content";

export function Faq() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow={FAQ.eyebrow} title={FAQ.title} />
      <div className="mt-12 divide-y divide-border border-y border-border">
        {FAQ.items.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {item.q}
              <span
                aria-hidden
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 3: Create the final CTA**

Create `apps/web/components/sections/final-cta.tsx`:

```tsx
import Link from "next/link";
import { Section } from "@/components/section";
import { FINAL_CTA } from "@/lib/content";

export function FinalCta() {
  return (
    <Section className="text-center">
      <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
        {FINAL_CTA.title}
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{FINAL_CTA.body}</p>
      <Link
        href={FINAL_CTA.href}
        className="mt-8 inline-block rounded-md bg-primary px-8 py-3.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {FINAL_CTA.cta} &rarr;
      </Link>
    </Section>
  );
}
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter web typecheck
```

Expected: only the known pre-existing `viewer-access.ts` error.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/sections/pricing.tsx apps/web/components/sections/faq.tsx apps/web/components/sections/final-cta.tsx
git commit -m "feat(web): add pricing, FAQ, and final CTA sections"
```

---

### Task 10: Compose the page and add SEO

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/app/robots.ts`
- Create: `apps/web/app/sitemap.ts`

**Interfaces:**
- Consumes: every section component from Tasks 5–9
- Produces: the rendered landing page at `/`

- [ ] **Step 1: Rewrite the page as a thin composition**

Replace the entire contents of `apps/web/app/page.tsx`:

```tsx
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/sections/hero";
import { ProofBar } from "@/components/sections/proof-bar";
import { Problem } from "@/components/sections/problem";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Anatomy } from "@/components/sections/anatomy";
import { WhyEvidence } from "@/components/sections/why-evidence";
import { Pricing } from "@/components/sections/pricing";
import { Faq } from "@/components/sections/faq";
import { FinalCta } from "@/components/sections/final-cta";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <ProofBar />
        <Problem />
        <HowItWorks />
        <Anatomy />
        <WhyEvidence />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
```

Note the `AuthButtons` widget is no longer on the landing page — sign-in lives behind the CTAs and on `/account`. If you decide it must stay, put it in the header, not the hero.

- [ ] **Step 2: Determine the production URL**

```bash
grep -rn "NEXT_PUBLIC_APP_URL\|BETTER_AUTH_URL\|VERCEL_URL" apps/web --include=*.ts --include=*.tsx .env.example 2>/dev/null | head
```

Use the existing env var if one is present. If none exists, use `https://nextbigthing.com.br` as the `metadataBase` and **flag it in the commit message as needing confirmation** — an incorrect `metadataBase` produces broken OG image URLs.

- [ ] **Step 3: Expand the layout metadata**

Replace the `metadata` export in `apps/web/app/layout.tsx` (added in Task 1):

```tsx
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://nextbigthing.com.br"),
  title: {
    default: "NextBigThing — SaaS ideas people are already asking for",
    template: "%s · NextBigThing",
  },
  description:
    "Every week we read public posts across Reddit, Hacker News, and Product Hunt for people describing products that don't exist yet — then score them and link back to the posts that prove demand.",
  openGraph: {
    type: "website",
    siteName: "NextBigThing",
    title: "SaaS ideas people are already asking for",
    description:
      "Scored, sourced demand signals from Reddit, Hacker News, and Product Hunt. Every idea links back to the posts behind it.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "NextBigThing — scored SaaS ideas with links to the posts that prove demand",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SaaS ideas people are already asking for",
    description:
      "Scored, sourced demand signals from Reddit, Hacker News, and Product Hunt.",
    images: ["/og.png"],
  },
};
```

`public/og.png` does not exist yet — it is a tracked open item in the spec. The reference is harmless until the asset lands.

- [ ] **Step 4: Add robots and sitemap**

Create `apps/web/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://nextbigthing.com.br";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/account"] }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
```

Create `apps/web/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://nextbigthing.com.br";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/ideas`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
```

- [ ] **Step 5: Verify the page renders**

```bash
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web dev
```

Open `http://localhost:3000` and confirm: all nine sections render in order, the hero animation cycles, the nav blurs on scroll, and the footer shows the legal entity. Check `http://localhost:3000/robots.txt` and `/sitemap.xml` return content.

- [ ] **Step 6: Verify no-JS readability**

Disable JavaScript in the browser and reload. **Expected:** all copy is readable, the FAQ still expands (native `<details>`), and the stat numbers show their true values. The hero animation stage will be empty — that is acceptable because it is `aria-hidden` decoration.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/page.tsx apps/web/app/layout.tsx apps/web/app/robots.ts apps/web/app/sitemap.ts
git commit -m "feat(web): compose the landing page and add SEO metadata"
```

---

### Task 11: Legal pages

**Files:**
- Create: `apps/web/components/legal/legal-page.tsx`
- Create: `apps/web/app/terms/page.tsx`
- Create: `apps/web/app/privacy/page.tsx`

**Interfaces:**
- Consumes: `COMPANY`, `PRICING` from `lib/content.ts`; `SiteHeader`, `SiteFooter`
- Produces: `<LegalPage title: string, intro: string, children>`; routes `/terms` and `/privacy`

- [ ] **Step 1: Create the legal page wrapper**

Create `apps/web/components/legal/legal-page.tsx`:

```tsx
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { COMPANY } from "@/lib/content";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pb-8 pt-16">
        <Link
          href="/"
          className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          &larr; Back to {COMPANY.name}
        </Link>

        <div className="mt-8 border-b border-border pb-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 text-muted-foreground">{intro}</p>
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            Last updated {COMPANY.lastUpdated}
          </p>
        </div>

        <div
          className="text-[0.95rem] leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-medium [&_h3]:text-foreground [&_li]:my-1.5 [&_p]:my-3 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:ps-5"
        >
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Write the Terms of Service**

Create `apps/web/app/terms/page.tsx`. Fifteen numbered `<h2>` sections, in this order: The service · Eligibility and accounts · Subscriptions, billing, and renewal · Refunds · What you may and may not do with the ideas · Source content and third-party rights · Acceptable use · Third-party services · Availability · Disclaimers · Limitation of liability · Termination · Changes to these terms · Governing law and venue · Contact.

Every legal fact interpolates from `COMPANY` and `PRICING` — no hardcoded names, amounts, or emails.

```tsx
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { COMPANY, PRICING } from "@/lib/content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your use of ${COMPANY.name}.`,
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms govern your use of ${COMPANY.name}, operated by ${COMPANY.legalName} (CNPJ ${COMPANY.cnpj}). Plain English, no surprises.`}
    >
      <h2>1. The service</h2>
      <p>
        {COMPANY.name} publishes a database of software product ideas. Each idea is derived from
        public posts on Reddit, Hacker News, and Product Hunt in which people describe a product
        they want but cannot find. We group related posts, score the strength of the demand, and
        link every idea back to the posts it came from.
      </p>
      <p>
        <strong>We report demand. We do not promise outcomes.</strong> An idea with a high demand
        score means many people asked for something similar. It does not mean a business built on
        it will succeed, and we make no representation that it will.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <p>
        You must be at least 18 years old and able to enter a binding contract. You are responsible
        for activity under your account and for keeping your sign-in method secure. Accounts are
        personal — do not share your access with others.
      </p>

      <h2>3. Subscriptions, billing, and renewal</h2>
      <p>
        Full access costs {PRICING.amountBRL} per {PRICING.term} ({PRICING.amountUSDApprox}),
        charged to a payment card. Prices are stated and charged in Brazilian reais; any figure
        shown in another currency is an approximation for reference only, and the amount billed
        will be in reais.
      </p>
      <ul>
        <li>
          <strong>Your subscription renews automatically</strong> for another {PRICING.term} at the
          then-current price, unless you cancel before the renewal date.
        </li>
        <li>You may cancel at any time. Access continues until the end of the period you have already paid for.</li>
        <li>Cancelling does not delete your account, and you keep access to the free ideas.</li>
        <li>If we change the price, the new price applies only from your next renewal, and we will tell you before it takes effect.</li>
      </ul>
      <p>
        {PRICING.freeIdeaCount} ideas are free to read without any payment or account.
      </p>

      <h2>4. Refunds</h2>
      <p>
        You may cancel your first purchase within {PRICING.refundDays} days and receive a full
        refund, for any reason or none. This reflects your right of regret under Article 49 of the
        Brazilian Consumer Protection Code (Lei nº 8.078/1990). Write to{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> and we will process it.
      </p>

      <h2>5. What you may and may not do with the ideas</h2>
      <p>
        <strong>You may build anything you find here.</strong> The ideas are not exclusive, we
        claim no ownership of what you create, and we ask for no share of it. Every subscriber sees
        the same ideas — you are paying for the evidence, not for exclusivity.
      </p>
      <p>You may not:</p>
      <ul>
        <li>Republish, resell, or redistribute the idea database or substantial parts of it.</li>
        <li>Scrape or bulk-export the content, or use automated means to access it beyond normal reading.</li>
        <li>Share your account so that people who have not paid can read the paid ideas.</li>
      </ul>

      <h2>6. Source content and third-party rights</h2>
      <p>
        Ideas are derived from posts written by other people on platforms we do not control.{" "}
        <strong>That source content belongs to its authors and to the platforms that host it</strong> —
        not to us, and not to you. We quote briefly and link back so you can read the original.
      </p>
      <p>
        What we do claim rights in is our own work: the grouping, the scoring, the written analysis,
        and the database as a whole. If you are the author of a post and would rather not be
        referenced, write to <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> and we will
        remove it.
      </p>

      <h2>7. Acceptable use</h2>
      <p>
        Do not attempt to break, overload, or gain unauthorised access to the service; do not probe
        or scan our infrastructure; and do not use the service to break the law.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        We rely on third parties to operate: a payment processor, a database host, an email
        provider, an authentication provider, an AI provider that helps analyse posts, and a
        hosting provider. Their handling of data is described in our{" "}
        <a href="/privacy">Privacy Policy</a>. Their own failures or outages are not within our
        control.
      </p>

      <h2>9. Availability</h2>
      <p>
        We aim to keep the service running but do not guarantee uninterrupted availability. We may
        change, suspend, or discontinue features. New ideas are published on a monthly cadence; we
        do not guarantee a specific number of ideas in any given period.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        The service is provided &ldquo;as is&rdquo;. We do not warrant that the demand scores,
        revenue estimates, or competition notes are accurate, complete, or suitable for any
        decision you make. <strong>Revenue figures are estimates presented as ranges, not
        forecasts.</strong> Business decisions you make based on this material are yours.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, our total liability arising out of or relating to
        the service is limited to the greater of the amount you paid us in the twelve months before
        the claim, or USD 50. We are not liable for lost profits, lost business, or indirect or
        consequential damages. Nothing here limits liability that cannot be limited under Brazilian
        consumer law.
      </p>

      <h2>12. Termination</h2>
      <p>
        You may stop using the service at any time. We may suspend or terminate access if you
        breach these terms — in which case we will refund any unused portion of your current period
        unless the breach involved redistribution or abuse of the service.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms. If a change materially affects your rights, we will notify you
        by email before it takes effect. Continuing to use the service after that means you accept
        the updated terms.
      </p>

      <h2>14. Governing law and venue</h2>
      <p>
        These terms are governed by the laws of {COMPANY.governingLaw}. Disputes are subject to{" "}
        {COMPANY.jurisdictionForum}, except where consumer law entitles you to bring a claim where
        you live.
      </p>

      <h2>15. Contact</h2>
      <p>
        {COMPANY.legalName} (CNPJ {COMPANY.cnpj}) —{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </p>
    </LegalPage>
  );
}
```

- [ ] **Step 3: Write the Privacy Policy**

Create `apps/web/app/privacy/page.tsx`. Twelve numbered sections: What we collect · How we use it · What we never do · Data we process about third parties · Sub-processors · Retention and deletion · Security · International data transfers · Children · Legal basis and your rights under the LGPD · Changes to this policy · Contact.

```tsx
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { COMPANY } from "@/lib/content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${COMPANY.name} handles your data.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="The short version: we collect the minimum needed to sign you in and bill you, we never sell your data, and you can delete your account whenever you want."
    >
      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account data</strong> — your email address, and your name and profile picture if you sign in with Google.</li>
        <li><strong>Payment data</strong> — subscription status, period dates, and a payment reference. <strong>We never see or store your card number</strong>; our payment processor handles it.</li>
        <li><strong>Technical data</strong> — standard server logs, including IP address and browser type, kept briefly for security and debugging.</li>
      </ul>
      <p>We do not use advertising trackers or third-party analytics cookies.</p>

      <h2>2. How we use it</h2>
      <ul>
        <li>To sign you in and keep your session working.</li>
        <li>To determine whether your access is active.</li>
        <li>To email you about billing, renewals, and material changes to the service.</li>
        <li>To keep the service secure and diagnose faults.</li>
      </ul>

      <h2>3. What we never do</h2>
      <ul>
        <li>We never sell or rent your personal data.</li>
        <li>We never share it with advertisers.</li>
        <li>We never email you marketing you did not ask for.</li>
      </ul>

      <h2>4. Data we process about third parties</h2>
      <p>
        This is unusual enough to spell out. Our product is built by reading{" "}
        <strong>public posts written by people who are not our users</strong> — on Reddit, Hacker
        News, and Product Hunt. When we store a post we keep its text, its public URL, the public
        username of its author, and public metrics such as upvote counts.
      </p>
      <p>
        We process this under our legitimate interest in identifying product demand, and we limit
        ourselves to content the author chose to publish publicly. We do not attempt to identify
        authors beyond their public username, we do not build profiles of them, and we do not
        contact them.
      </p>
      <p>
        <strong>If you wrote a post we reference and want it removed</strong>, write to{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> and we will delete it and any idea
        that depends on it.
      </p>

      <h2>5. Sub-processors</h2>
      <p>We share the minimum necessary data with:</p>
      <ul>
        <li><strong>AbacatePay</strong> — payment processing and subscription billing.</li>
        <li><strong>Google</strong> — optional sign-in.</li>
        <li><strong>Resend</strong> — transactional and sign-in emails.</li>
        <li><strong>Anthropic</strong> — analysis of public posts. We do not send your personal data to this provider.</li>
        <li><strong>Our database and hosting providers</strong> — storage and serving of the application.</li>
      </ul>

      <h2>6. Retention and deletion</h2>
      <p>
        We keep account data while your account exists. Ask us to delete your account and we remove
        your personal data within 30 days, except records we must keep for tax or accounting
        purposes, which we retain for the period Brazilian law requires. Server logs are kept for a
        short period and then discarded.
      </p>

      <h2>7. Security</h2>
      <p>
        Data is encrypted in transit. Access to production systems is limited to the operator.
        No system is perfectly secure, but we do not retain card data, which removes the most
        sensitive category of risk entirely.
      </p>

      <h2>8. International data transfers</h2>
      <p>
        Some of our providers operate outside Brazil, so your data may be processed abroad. Where
        that happens we rely on the transfer mechanisms permitted by the LGPD and choose providers
        that offer appropriate safeguards.
      </p>

      <h2>9. Children</h2>
      <p>
        The service is not intended for anyone under 18, and we do not knowingly collect data from
        children. If you believe a child has given us data, contact us and we will delete it.
      </p>

      <h2>10. Legal basis and your rights under the LGPD</h2>
      <p>
        {COMPANY.legalName} (CNPJ {COMPANY.cnpj}) is the controller of your personal data. We
        process it on the basis of performing our contract with you (providing and billing the
        service), complying with legal obligations (tax records), and our legitimate interests
        (security, and identifying product demand from public posts).
      </p>
      <p>Under Lei nº 13.709/2018 you may request:</p>
      <ul>
        <li>Confirmation that we process your data, and access to it.</li>
        <li>Correction of incomplete or inaccurate data.</li>
        <li>Anonymisation, blocking, or deletion of unnecessary or excessive data.</li>
        <li>Portability of your data to another provider.</li>
        <li>Deletion of data processed with your consent.</li>
        <li>Information about who we share your data with.</li>
        <li>To object to processing based on legitimate interests.</li>
      </ul>
      <p>
        Write to <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> to exercise any of these;
        that address also reaches our data protection officer. You may also complain to the ANPD,
        the Brazilian data protection authority.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We will update this page if our practices change, and will email registered users before
        any material change takes effect.
      </p>

      <h2>12. Contact</h2>
      <p>
        {COMPANY.legalName} (CNPJ {COMPANY.cnpj}) —{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </p>
    </LegalPage>
  );
}
```

- [ ] **Step 4: Verify the copy-lint still passes**

The legal pages contain words like "lifetime" only if written carelessly — the lint covers `lib/content.ts`, not JSX, so check manually:

```bash
grep -n "lifetime\|forever\|LinkedIn\|Twitter" apps/web/app/terms/page.tsx apps/web/app/privacy/page.tsx
```

Expected: no output.

- [ ] **Step 5: Verify build and render**

```bash
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

Then run `pnpm --filter web dev` and confirm `/terms` and `/privacy` render with header, footer, correct entity name, CNPJ, and "Last updated July 20, 2026". Confirm the footer's Legal column links reach both.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/legal apps/web/app/terms apps/web/app/privacy
git commit -m "feat(web): add Terms of Service and Privacy Policy pages"
```

---

### Task 12: Fix stale copy across the app

Removes the lifetime/weekly wording that now contradicts the landing page, and applies shared chrome to the remaining pages.

**Files:**
- Modify: `apps/web/components/paywall-cta.tsx:21,23`
- Modify: `apps/web/app/account/page.tsx:22`
- Modify: `apps/web/app/ideas/page.tsx`
- Modify: `apps/web/app/ideas/[slug]/page.tsx:36-38`
- Modify: `apps/web/app/admin/page.tsx`
- Modify: `apps/web/lib/payments/abacatepay.ts:93`
- Modify: `apps/web/lib/payments/provider.ts:5`

**Interfaces:**
- Consumes: `PRICING` from `lib/content.ts`; `SiteHeader`, `SiteFooter`
- Produces: no new exports

- [ ] **Step 1: Find every stale string**

```bash
grep -rn "lifetime\|forever\|Updated weekly\|weekly cadence" apps/web --include=*.ts --include=*.tsx
```

Record the full list. Every hit must be resolved by the end of this task.

- [ ] **Step 2: Update the paywall CTA**

In `apps/web/components/paywall-cta.tsx`, replace the lifetime wording. Read the file first, then apply:

- Line ~21: `Unlock every idea — R$110 lifetime` → `Unlock every idea — {PRICING.amountBRL}/{PRICING.term}`
- Line ~23: `One card payment. All current and future ideas, forever.` → `Card payment, renews annually. Cancel any time — access runs to the end of your paid period.`

Import `PRICING` from `@/lib/content` rather than hardcoding the amount.

- [ ] **Step 3: Update the account page**

In `apps/web/app/account/page.tsx`, `Lifetime access active` becomes a subscription state. Show the renewal date from the purchase's `periodEnd`, plus cancellation information:

```tsx
<p className="font-medium">Access active</p>
<p className="text-sm text-muted-foreground">
  Renews on {periodEnd.toLocaleDateString("en-US", { dateStyle: "long" })}. Cancel any time —
  your access continues to the end of the period you have paid for.
</p>
```

Use whatever variable already holds the purchase record in that file. **If `periodEnd` is not available in scope, do not invent it** — read `lib/viewer-access.ts` and use the value the access check already returns.

- [ ] **Step 4: Update the ideas pages**

In `apps/web/app/ideas/page.tsx`, change the subhead `Sourced from Reddit, Hacker News, and Product Hunt. Updated weekly.` to `Sourced from Reddit, Hacker News, and Product Hunt. New ideas every month.`

In `apps/web/app/ideas/[slug]/page.tsx:36-38`, reword the locked-idea message from lifetime to subscription framing.

**Do not change the props or type signature of `LockedTeaser`.** It takes the branded `TeaserIdea` type specifically so paid fields cannot leak to unpaid visitors.

- [ ] **Step 5: Update the payment strings**

`apps/web/lib/payments/abacatepay.ts:93` — reword the error string to remove "lifetime".

`apps/web/lib/payments/provider.ts:5` — change the comment `// R$110 ≈ $20 lifetime access` to `// R$110 ≈ US$20, charged annually`.

**Do not change `PRICE_CENTS` or any payment logic.** This step is comments and strings only.

- [ ] **Step 6: Apply shared chrome to the remaining pages**

Wrap `app/ideas/page.tsx`, `app/ideas/[slug]/page.tsx`, `app/account/page.tsx`, and `app/admin/page.tsx` in `<SiteHeader />` / `<SiteFooter />` so navigation is consistent. Keep each page's existing `max-w-*` on its `<main>`.

- [ ] **Step 7: Verify no stale copy remains**

```bash
grep -rn "lifetime\|forever\|Updated weekly\|weekly cadence" apps/web --include=*.ts --include=*.tsx
```

Expected: **no output.** If `docs/` or test files match, that's fine — this grep is scoped to `apps/web` source.

- [ ] **Step 8: Run the full check**

```bash
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
```

Expected: tests pass; typecheck shows **only** the known pre-existing `viewer-access.ts` error; lint and build clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "fix(web): replace lifetime and weekly copy with subscription wording"
```

---

### Task 13: Responsive and accessibility pass

**Files:**
- Modify: `apps/web/components/sections/hero-animation.tsx` (mobile variant)
- Modify: any section with layout problems found

**Interfaces:**
- Consumes: everything built so far
- Produces: no new exports

- [ ] **Step 1: Add the mobile hero variant**

The radial composition does not fit narrow viewports. In `hero-animation.tsx`, read the viewport width and reduce the work below 640px: use `SAMPLE_POSTS.slice(0, 5)` instead of all nine, and shrink the spawn radius multipliers from `0.6`/`0.7` to `0.45`/`0.5`.

```tsx
const isNarrow = typeof window !== "undefined" && window.innerWidth < 640;
const posts = isNarrow ? SAMPLE_POSTS.slice(0, 5) : SAMPLE_POSTS;
```

Compute this inside the effect, not during render, to avoid a hydration mismatch.

- [ ] **Step 2: Check every breakpoint for overflow**

```bash
pnpm --filter web dev
```

At **320, 375, 390, and 430px** wide, load `/`, `/terms`, and `/privacy`. In the browser console:

```js
document.documentElement.scrollWidth > document.documentElement.clientWidth
```

Expected: `false` at every width on every page. If `true`, find the offending element and constrain it.

- [ ] **Step 3: Check contrast and focus**

- Confirm body text (`--muted-foreground` on `--background`) meets 4.5:1. If it fails, lighten `--muted-foreground` in `packages/ui/src/styles/globals.css` — do not fix it per-component.
- Tab through the whole page. Every link, button, and FAQ summary must show a visible focus ring, and the tab order must follow reading order.

- [ ] **Step 4: Verify reduced motion**

Enable "Reduce motion" in your OS accessibility settings, reload `/`, and confirm:
- The hero shows a **completed idea card with its real score** — not an empty stage.
- The proof-bar numbers show final values immediately.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "fix(web): responsive hero variant and accessibility pass"
```

---

## Self-Review

**Spec coverage** — every spec section maps to a task:

| Spec section | Task |
|---|---|
| Dark-only migration | 1 |
| Visual system / section primitives | 5 |
| 01 Sticky nav | 5 |
| 02 Hero + animation | 6, 7 |
| 03 Proof bar + floor rule | 4, 8 |
| 04 The problem | 7 |
| 05 How it works | 7 |
| 06 Anatomy | 8 |
| 07 Why evidence wins | 8 |
| 08 Pricing (with pre-purchase disclosure) | 9 |
| 09 FAQ | 9 |
| 10 Final CTA | 9 |
| 11 Footer | 5 |
| Derived statistics | 4 |
| Motion system | 6, 8, 13 |
| Legal pages + three extra exposures | 11 |
| Copy corrections outside landing | 12 |
| SEO | 10 |
| Trust constraints | 3 (executable) |
| Testing (responsive, a11y, reduced motion) | 13 |
| Paywall safety constraint | Global Constraints + 12 |

**Deliberately not covered:**
- `public/og.png` — a design asset, tracked as an open item in the spec.
- `lib/viewer-access.ts` compile error — belongs to the subscription migration; called out in Global Constraints so it isn't mistaken for damage caused by this work.
- `app/api/payments/checkout/route.ts:15` — logic, not copy; explicitly out of scope in the spec.

**Type consistency check:** `RawStats` / `LandingStats` / `applyStatsFloor` / `STATS_FLOOR` (Task 4) are used with identical names in Task 8. `SampleIdea` (Task 2) is consumed under the same name in Task 6. `Section` / `Eyebrow` / `SectionHeading` (Task 5) keep consistent props across Tasks 7–9. `PRICING.amountBRL` / `.term` / `.freeIdeaCount` / `.refundDays` are used consistently in Tasks 9, 11, and 12.

## Release gate

**This branch must not deploy to production until the remaining annual-subscription migration tasks land.** The page will honestly advertise annual subscription pricing that the checkout flow does not yet fully implement.

## Legal disclaimer

The Terms and Privacy pages are written to be accurate and specific, but **they have not been reviewed by a lawyer.** They should be before the product takes money.
