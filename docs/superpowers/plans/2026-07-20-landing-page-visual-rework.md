# Landing Page Visual Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the marketing landing page so a visitor sees a complete, concrete scored idea within the first scroll, with sections visually connected by a rail rather than floating as identical cards in a void.

**Architecture:** Eight sections replace the current nine. Two new sections (Specimen, Dissection) render a hardcoded example idea card; the card pins with CSS `position: sticky` while four explanatory passages scroll past, their active state driven by `IntersectionObserver`. No new npm dependency — motion reuses the `IntersectionObserver` + CSS transition pattern already proven in `stat-counter.tsx`.

**Tech Stack:** Next.js 16.2.6 (App Router, React 19.2.4), Tailwind CSS v4 (CSS-first `@theme inline`, no `tailwind.config.js`), TypeScript, Vitest 3 (node environment), pnpm workspaces + turbo.

**Spec:** `docs/superpowers/specs/2026-07-20-landing-page-rework-design.md`

**Predecessor:** This reworks the page built by `docs/superpowers/plans/2026-07-20-landing-page-rework.md` (shipped in `5af881e`). That plan is history — do not edit it, and note that its "`motion` v12" dependency was later removed. There is no motion library in this repo.

## Global Constraints

- **No new npm dependency**, runtime or dev. No motion library. No jsdom/testing-library.
- **Dark theme only.** The `dark` class is hardcoded on `<html>` in `app/layout.tsx`. Never add a light-theme block.
- **The specimen card is the only glowing bordered card on the page.** All other new content uses hairline dividers, rails, and bare background — no `rounded-xl border border-border bg-card p-6`. This rule is the entire point of the rework; violating it reintroduces the defect.
- **Specimen content integrity (binding, not stylistic):** the card renders a visible `EXAMPLE ENTRY` tag, and evidence rows render as **plain text with source labels — never as links**. Fabricated URLs would falsify the page's central claim.
- **The hero `<h1>` must remain the LCP element.** Never let the animation take it. (Existing comment at `hero.tsx:14`.)
- **Reduced motion:** every animation is gated on `prefers-reduced-motion: reduce` and degrades to the fully-composed static state, never an empty or mid-animation one.
- **Copy rules are enforced by test.** `lib/content.test.ts` recursively collects every string in `lib/content.ts` and asserts banned phrases are absent: `powerful`, `seamless`, `supercharge`, `unlock the power`, `game-changing`, `revolutionary`, `cutting-edge`, `best-in-class`, `trusted by`, `loved by`, `lifetime`, `forever`, `weekly cadence`, `linkedin`, `twitter`. Also forbidden: any claim that new ideas arrive weekly, and any bare `$20` not preceded by `≈`.
- **Emerald usage:** `--primary` (`oklch(0.432 0.095 166.913)`) is for button fills only. Numeric emphasis uses `--chart-1`, available as the `text-chart-1` / `bg-chart-1` / `border-chart-1` utilities (mapped at `packages/ui/src/styles/globals.css:24`).
- **Every task must leave the app building.** Do not delete a component in one task and unwire it in another.

**Commands:**
- Tests: `pnpm --filter web test`
- Typecheck: `pnpm typecheck`
- Build: `DATABASE_URL=<url> pnpm build` (build reads the DB during page data collection and fails without it)
- Dev server: `pnpm dev`

---

## File Structure

**Create:**
- `apps/web/components/specimen-card.tsx` — the example idea card. Pure presentational, no client hooks, so both Specimen and Dissection can render it.
- `apps/web/components/sections/specimen.tsx` — section 02 wrapper.
- `apps/web/components/sections/dissection.tsx` — section 03, `"use client"`, owns sticky + scroll state.

**Modify:**
- `apps/web/lib/content.ts` — add `SPECIMEN`, `DISSECTION`; remove `PROBLEM`, `ANATOMY`
- `apps/web/lib/content.test.ts` — content-integrity assertions
- `apps/web/components/section.tsx` — `density` prop, `Rail` / `RailStep` primitives
- `apps/web/components/sections/hero.tsx` — un-carded animation layering
- `apps/web/components/sections/hero-animation.tsx` — container classes only (line 244); geometry untouched
- `apps/web/components/sections/how-it-works.tsx` — rail sequence
- `apps/web/components/sections/why-evidence.tsx` — absorbs proof stats, off the card primitive
- `apps/web/components/sections/stat-counter.tsx` — card chrome stripped
- `apps/web/app/page.tsx` — section order

**Delete:**
- `apps/web/components/sections/problem.tsx` (Task 1)
- `apps/web/components/sections/anatomy.tsx` (Task 4)
- `apps/web/components/sections/proof-bar.tsx` (Task 7)

---

## Task 1: Content layer — specimen data, drop the Problem section

**Files:**
- Modify: `apps/web/lib/content.ts` (remove `PROBLEM` at lines 44-48; add `SPECIMEN` and `DISSECTION`)
- Modify: `apps/web/lib/content.test.ts` (append new describe block)
- Modify: `apps/web/app/page.tsx` (remove `Problem` import and usage)
- Delete: `apps/web/components/sections/problem.tsx`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `SPECIMEN` and `DISSECTION` consts, and the exported type `SpecimenEvidence = { quote: string; source: string }`. Tasks 3 and 4 read these. Field names used downstream: `SPECIMEN.eyebrow`, `.sectionTitle`, `.intro`, `.exampleTag`, `.evidenceHeading`, `.labels.{score,asks,mrr,sources}`, `SPECIMEN.idea.{niche,title,oneLiner,demandScore,asks,mrrRange,evidence[]}`, `DISSECTION.steps[].{n,key,title,body}`.

- [ ] **Step 1: Write the failing test**

In `apps/web/lib/content.test.ts`, update the import on line 3 to include `SPECIMEN`:

```ts
import { COMPANY, PRICING, SOURCES, SPECIMEN } from "./content";
```

Then append:

```ts
describe("specimen content integrity", () => {
  // These assertions encode a product requirement, not a style preference.
  // The page's central claim is that every number traces back to a post you
  // can go read. The specimen is hand-written, so it must be labelled as an
  // example and must never present a fabricated audit trail.
  it("carries a non-empty example tag", () => {
    expect(SPECIMEN.exampleTag.trim().length).toBeGreaterThan(0);
  });

  it("never attaches a link to an evidence quote", () => {
    for (const row of SPECIMEN.idea.evidence) {
      expect(Object.keys(row).sort()).toEqual(["quote", "source"]);
    }
  });

  it("attributes every quote to a declared source", () => {
    const names = SOURCES.map((s) => s.name);
    for (const row of SPECIMEN.idea.evidence) {
      expect(names).toContain(row.source);
    }
  });

  it("has a demand score inside the documented 0-100 range", () => {
    expect(SPECIMEN.idea.demandScore).toBeGreaterThanOrEqual(0);
    expect(SPECIMEN.idea.demandScore).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `SPECIMEN` is not exported from `./content`.

- [ ] **Step 3: Add the content**

In `apps/web/lib/content.ts`, **delete** the `PROBLEM` block (lines 44-48) and add the following after the `HERO` block:

```ts
export type SpecimenEvidence = {
  quote: string;
  source: (typeof SOURCES)[number]["name"];
};

// Illustrative, NOT a real published entry — the same standard as SAMPLE_IDEAS
// below. `exampleTag` renders on the card, and evidence rows deliberately carry
// no href. See docs/superpowers/specs/2026-07-20-landing-page-rework-design.md,
// "Content integrity". Enforced by lib/content.test.ts.
export const SPECIMEN = {
  eyebrow: "What you get",
  sectionTitle: "This is one of them.",
  intro:
    "One entry, in full. Every published idea carries the same evidence, so you can judge it the way you'd judge your own research.",
  exampleTag: "Example entry",
  evidenceHeading: "What people actually said",
  labels: {
    score: "Demand",
    asks: "Asks",
    mrr: "Est. MRR",
    sources: "Sources",
  },
  idea: {
    niche: "Finance ops",
    title: "Invoice autopilot",
    oneLiner:
      "Watches your billing inbox and sends the invoice without being asked twice.",
    demandScore: 94,
    asks: 47,
    mrrRange: "$2–6k",
    evidence: [
      { quote: "Six tools tried, none of them just send the invoice.", source: "Reddit" },
      { quote: "I'd pay for something that does only this.", source: "Hacker News" },
      { quote: "Every billing tool wants to be an ERP.", source: "Product Hunt" },
    ] as readonly SpecimenEvidence[],
  },
} as const;

// The four passages that scroll past the pinned specimen. `key` maps to the
// region of the card that highlights while the passage is active — the values
// must stay in sync with SPECIMEN_REGIONS in components/specimen-card.tsx.
export const DISSECTION = {
  steps: [
    {
      n: "01",
      key: "score",
      title: "The score",
      body: "0–100, from how many people asked and how strongly they asked. A 94 means this one came up constantly, in frustrated language.",
    },
    {
      n: "02",
      key: "numbers",
      title: "The numbers",
      body: "Ask count is distinct posts, not upvotes. The revenue figure is a range derived from comparable products — a range, because that is what it honestly is.",
    },
    {
      n: "03",
      key: "receipts",
      title: "The receipts",
      body: "Every claim traces to a post. On a published entry these are live links you can go read yourself.",
    },
    {
      n: "04",
      key: "catch",
      title: "The catch",
      body: "What already exists, and where it falls short of what people asked for.",
    },
  ],
} as const;
```

- [ ] **Step 4: Delete the Problem section and unwire it**

```bash
rm apps/web/components/sections/problem.tsx
```

In `apps/web/app/page.tsx`, remove line 5 (`import { Problem } ...`) and line 20 (`<Problem />`).

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter web test && pnpm typecheck`
Expected: PASS. All existing tests plus 4 new ones green; no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/content.ts apps/web/lib/content.test.ts apps/web/app/page.tsx apps/web/components/sections/problem.tsx
git commit -m "feat(web): add specimen content, drop standalone Problem section"
```

---

## Task 2: Section primitives — variable rhythm and the rail

**Files:**
- Modify: `apps/web/components/section.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `Section` gains an optional `density?: "tight" | "default" | "open"` prop (default `"default"`). New exports `Rail` and `RailStep`. `RailStep` signature: `({ n, title, body, active }: { n: string; title: string; body: string; active?: boolean })` — `active` defaults to `true`, so server components can use it without passing state. Tasks 4 and 6 consume these.

- [ ] **Step 1: Replace the Section component**

In `apps/web/components/section.tsx`, replace the `Section` function (lines 3-23) with:

```tsx
// Uniform py-20/py-28 on every section is what produced the dead voids on the
// old page — a two-sentence section got the same vertical budget as a six-cell
// grid. Density is chosen per-section by content weight.
const DENSITY = {
  tight: "py-12 sm:py-16",
  default: "py-20 sm:py-28",
  open: "py-28 sm:py-40",
} as const;

export function Section({
  id,
  className,
  ariaLabel,
  density = "default",
  children,
}: {
  id?: string;
  className?: string;
  ariaLabel?: string;
  density?: keyof typeof DENSITY;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={ariaLabel}
      className={cn("mx-auto max-w-6xl scroll-mt-24 px-6", DENSITY[density], className)}
    >
      {children}
    </section>
  );
}
```

- [ ] **Step 2: Add the rail primitives**

Append to `apps/web/components/section.tsx`:

```tsx
// The connective tissue of the page. A single hairline runs the height of the
// list with a node per step, so sections read as entries in one record rather
// than as independent floating cards.
export function Rail({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ol className={cn("relative border-l border-border pl-8", className)}>{children}</ol>;
}

export function RailStep({
  n,
  title,
  body,
  active = true,
}: {
  n: string;
  title: string;
  body: string;
  active?: boolean;
}) {
  return (
    <li
      className={cn(
        "relative pb-10 transition-opacity duration-500 last:pb-0",
        active ? "opacity-100" : "opacity-30",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute -left-[33px] top-1.5 size-1.5 rounded-full ring-4 ring-background transition-colors duration-500",
          active ? "bg-chart-1" : "bg-border",
        )}
      />
      <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
        {n}
      </span>
      <h3 className="mt-2 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}
```

- [ ] **Step 3: Verify nothing regressed**

Run: `pnpm --filter web test && pnpm typecheck`
Expected: PASS. `density` is optional so all existing `<Section>` call sites still compile.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/section.tsx
git commit -m "feat(web): add section density and rail primitives"
```

---

## Task 3: The specimen card and section 02

**Files:**
- Create: `apps/web/components/specimen-card.tsx`
- Create: `apps/web/components/sections/specimen.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `SPECIMEN` from Task 1; `Section`, `SectionHeading` from Task 2.
- Produces: `SpecimenCard` — `({ highlight }: { highlight?: SpecimenRegion })`, plus `export const SPECIMEN_REGIONS = ["score", "numbers", "receipts", "catch"] as const` and `export type SpecimenRegion = (typeof SPECIMEN_REGIONS)[number] | null`. Task 4 renders this with a live `highlight`.

- [ ] **Step 1: Create the card**

Create `apps/web/components/specimen-card.tsx`:

```tsx
import { cn } from "@workspace/ui/lib/utils";
import { SOURCES, SPECIMEN } from "@/lib/content";

// Keys must stay in sync with DISSECTION.steps[].key in lib/content.ts.
export const SPECIMEN_REGIONS = ["score", "numbers", "receipts", "catch"] as const;
export type SpecimenRegion = (typeof SPECIMEN_REGIONS)[number] | null;

const SOURCE_COLOR = new Map(SOURCES.map((s) => [s.name, s.color]));

// Dimming the inactive regions rather than brightening the active one keeps the
// card readable when nothing is highlighted (mobile, reduced motion, no JS).
function region(active: SpecimenRegion, self: SpecimenRegion) {
  return cn("transition-opacity duration-500", active && active !== self && "opacity-40");
}

export function SpecimenCard({ highlight = null }: { highlight?: SpecimenRegion }) {
  const { idea, labels, exampleTag, evidenceHeading } = SPECIMEN;

  return (
    <article className="overflow-hidden rounded-xl border border-chart-1/25 bg-gradient-to-br from-chart-1/[0.06] to-transparent">
      <div className="flex items-start justify-between gap-6 p-6">
        <div>
          <span className="inline-block rounded border border-border px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
            {exampleTag}
          </span>
          <div className="mt-3 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-chart-1">
            {idea.niche}
          </div>
          <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{idea.title}</h3>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {idea.oneLiner}
          </p>
        </div>

        <div className={cn("shrink-0 text-right", region(highlight, "score"))}>
          <div className="font-mono text-4xl font-bold leading-none tracking-tight text-chart-1 tabular-nums sm:text-5xl">
            {idea.demandScore}
          </div>
          <div className="mt-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground">
            {labels.score}
          </div>
          <div className="mt-2 h-0.5 w-16 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-chart-1" style={{ width: `${idea.demandScore}%` }} />
          </div>
        </div>
      </div>

      <dl
        className={cn(
          "grid grid-cols-3 gap-px border-y border-border bg-border",
          region(highlight, "numbers"),
        )}
      >
        {[
          { v: idea.asks, l: labels.asks },
          { v: idea.mrrRange, l: labels.mrr },
          { v: SOURCES.length, l: labels.sources },
        ].map((cell) => (
          <div key={cell.l} className="bg-background px-4 py-3.5 sm:px-6">
            <dt className="sr-only">{cell.l}</dt>
            <dd>
              <span className="block font-mono text-base font-semibold tabular-nums">{cell.v}</span>
              <span className="mt-1 block font-mono text-[0.55rem] uppercase tracking-[0.17em] text-muted-foreground">
                {cell.l}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <div className={cn("p-6", region(highlight, "receipts"))}>
        <h4 className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground">
          {evidenceHeading}
        </h4>
        <ul className="mt-3">
          {/* Plain text, never links — see the content-integrity constraint. */}
          {idea.evidence.map((row) => (
            <li
              key={row.quote}
              className="flex items-baseline gap-3 border-b border-border/50 py-2.5 last:border-b-0"
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: SOURCE_COLOR.get(row.source) }}
              />
              <span className="text-sm italic leading-relaxed text-foreground/80">
                &ldquo;{row.quote}&rdquo;
              </span>
              <span className="ml-auto shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground">
                {row.source}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Create the section**

Create `apps/web/components/sections/specimen.tsx`:

```tsx
import { Section, SectionHeading } from "@/components/section";
import { SpecimenCard } from "@/components/specimen-card";
import { SPECIMEN } from "@/lib/content";

export function Specimen() {
  return (
    <Section id="specimen" density="tight">
      <SectionHeading
        eyebrow={SPECIMEN.eyebrow}
        title={SPECIMEN.sectionTitle}
        intro={SPECIMEN.intro}
      />
      <div className="mt-10 max-w-2xl">
        <SpecimenCard />
      </div>
    </Section>
  );
}
```

- [ ] **Step 3: Wire it into the page**

In `apps/web/app/page.tsx`, add:

```tsx
import { Specimen } from "@/components/sections/specimen";
```

and render `<Specimen />` immediately after `<ProofBar />`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter web test && pnpm typecheck`
Expected: PASS.

Then run `pnpm dev` and open `http://localhost:3000`. Confirm: the card shows `EXAMPLE ENTRY`, the score `94` renders large in bright emerald (not the dark `--primary`), and the three evidence quotes are **plain text, not clickable**.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/specimen-card.tsx apps/web/components/sections/specimen.tsx apps/web/app/page.tsx
git commit -m "feat(web): add specimen card and section"
```

---

## Task 4: The dissection — sticky card, scroll-driven passages

**Files:**
- Create: `apps/web/components/sections/dissection.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/lib/content.ts` (remove the `ANATOMY` block)
- Delete: `apps/web/components/sections/anatomy.tsx`

**Interfaces:**
- Consumes: `DISSECTION` (Task 1), `SpecimenCard` / `SpecimenRegion` (Task 3), `Section` (Task 2).
- Produces: `Dissection` component. Nothing downstream consumes it.

- [ ] **Step 1: Create the dissection section**

Create `apps/web/components/sections/dissection.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { Section } from "@/components/section";
import { SpecimenCard, type SpecimenRegion } from "@/components/specimen-card";
import { DISSECTION } from "@/lib/content";

export function Dissection() {
  const [active, setActive] = useState<SpecimenRegion>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    // Reduced motion gets every passage at full opacity and no highlight
    // tracking — the composed state, not a mid-animation one.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The sticky/tracking layout only exists at lg and up; below that the
    // section is a plain stack and a highlight would be meaningless.
    if (!window.matchMedia("(min-width: 1024px)").matches) return;

    const nodes = stepRefs.current.filter((n): n is HTMLLIElement => n !== null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry nearest the vertical middle of the viewport so the
        // highlight follows reading position rather than whichever element
        // happened to fire last.
        const mid = window.innerHeight / 2;
        let best: { key: SpecimenRegion; dist: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const box = entry.boundingClientRect;
          const dist = Math.abs(box.top + box.height / 2 - mid);
          const key = (entry.target as HTMLElement).dataset.region as SpecimenRegion;
          if (!best || dist < best.dist) best = { key, dist };
        }
        if (best) setActive(best.key);
      },
      { rootMargin: "-35% 0px -35% 0px", threshold: 0 },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  return (
    <Section id="anatomy" density="tight">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SpecimenCard highlight={active} />
        </div>

        <ol className="relative border-l border-border pl-8 lg:pt-16">
          {DISSECTION.steps.map((step, i) => (
            <li
              key={step.key}
              data-region={step.key}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              className={cn(
                "relative pb-14 transition-opacity duration-500 last:pb-0",
                // No active region means nothing has been chosen yet (mobile,
                // reduced motion, pre-scroll) — show everything.
                active === null || active === step.key ? "opacity-100" : "opacity-30",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute -left-[33px] top-1.5 size-1.5 rounded-full ring-4 ring-background transition-colors duration-500",
                  active === step.key ? "bg-chart-1" : "bg-border",
                )}
              />
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                {step.n}
              </span>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
```

This section carries `id="anatomy"` because the old `Anatomy` section owned that anchor. Before changing it, check for in-page links: `grep -rn "#anatomy" apps/web --include=*.ts --include=*.tsx`.

- [ ] **Step 2: Remove the old Anatomy section**

```bash
rm apps/web/components/sections/anatomy.tsx
```

In `apps/web/lib/content.ts`, delete the entire `ANATOMY` block.

In `apps/web/app/page.tsx`: remove the `Anatomy` import and `<Anatomy />`, add the `Dissection` import, and render `<Dissection />` immediately after `<Specimen />`.

```tsx
import { Dissection } from "@/components/sections/dissection";
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter web test && pnpm typecheck`
Expected: PASS. (The content test's `allStrings` walk adapts automatically to the removed `ANATOMY` export.)

- [ ] **Step 4: Manual verification — this is the task's real test**

Run `pnpm dev`, open `http://localhost:3000`, confirm all four:

1. **Desktop ≥1024px:** the card pins while the four passages scroll past; exactly one passage is at full opacity and the matching card region brightens while the others dim.
2. **Below 1024px:** card and passages stack; all four passages at full opacity; nothing pins.
3. **Reduced motion:** enable it (macOS: System Settings → Accessibility → Display → Reduce motion), reload, confirm all passages at full opacity with no highlight tracking.
4. **320px width:** the card's three-cell stat row stays legible and the page does not scroll horizontally.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/sections/dissection.tsx apps/web/components/sections/anatomy.tsx apps/web/lib/content.ts apps/web/app/page.tsx
git commit -m "feat(web): replace Anatomy with scroll-driven Dissection"
```

---

## Task 5: Un-card the hero

**Files:**
- Modify: `apps/web/components/sections/hero-animation.tsx` (the stage container, line 244)
- Modify: `apps/web/components/sections/hero.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: nothing new. Visual change only.

**Do not touch the animation geometry.** Spawn radius, card sizing, and the 9.1s cycle were tuned in commit `1cf3bff`. Only the container's classes and the section's layering change.

- [ ] **Step 1: Strip the container chrome**

In `apps/web/components/sections/hero-animation.tsx`, the stage element currently reads:

```tsx
      className="relative h-[420px] overflow-hidden rounded-xl border border-border sm:h-[520px] lg:h-[580px]"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 12%, var(--background)) 0%, var(--background) 62%)",
      }}
```

Replace both props with a single merged pair — note the `background` value is carried over verbatim, and there must be exactly one `style` prop:

```tsx
      className="relative h-[420px] overflow-hidden sm:h-[520px] lg:h-[580px]"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 12%, var(--background)) 0%, var(--background) 62%)",
        // Fades the field into the page instead of ending it at a border.
        maskImage:
          "linear-gradient(to bottom, transparent, black 12%, black 72%, transparent), linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        maskComposite: "intersect",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, black 12%, black 72%, transparent), linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        WebkitMaskComposite: "source-in",
      }}
```

- [ ] **Step 2: Layer the pitch over the field**

Replace `apps/web/components/sections/hero.tsx` entirely:

```tsx
import Link from "next/link";
import { Eyebrow } from "@/components/section";
import { HeroAnimation } from "@/components/sections/hero-animation";
import { HERO } from "@/lib/content";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-8 pt-12 sm:pt-20">
      {/* The animation is a full-bleed ambient field, not a widget in a card.
          It sits behind the pitch and bleeds past the content measure on both
          sides; its mask fades it into the page. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-24 -z-10 sm:top-32">
        <HeroAnimation />
      </div>

      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center">
        <Eyebrow>{HERO.eyebrow}</Eyebrow>
        {/* This h1 must remain the LCP element — never let the animation take it. */}
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          {HERO.headline}
        </h1>
        <p className="text-pretty text-muted-foreground">{HERO.subhead}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
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

      {/* Reserves the field's height so the next section doesn't overlap it. */}
      <div aria-hidden className="h-[300px] sm:h-[380px] lg:h-[430px]" />
    </section>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter web test && pnpm typecheck`
Expected: PASS.

Then `pnpm dev` and confirm at 1440px and at 375px:
- No border or rounded corner anywhere around the animation.
- The post cards drift behind and around the headline without ever obscuring it.
- The field fades out at its edges instead of ending at a hard line.
- The Specimen section below does not collide with the animation.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/sections/hero.tsx apps/web/components/sections/hero-animation.tsx
git commit -m "feat(web): un-card the hero animation into a full-bleed field"
```

---

## Task 6: How-it-works as a rail sequence

**Files:**
- Modify: `apps/web/components/sections/how-it-works.tsx`

**Interfaces:**
- Consumes: `Rail`, `RailStep` (Task 2); `HOW_IT_WORKS` (unchanged). Produces: nothing new.

- [ ] **Step 1: Replace the grid with the rail**

Replace `apps/web/components/sections/how-it-works.tsx` entirely:

```tsx
import { Rail, RailStep, Section, SectionHeading } from "@/components/section";
import { HOW_IT_WORKS } from "@/lib/content";

export function HowItWorks() {
  return (
    <Section id="how-it-works" density="tight">
      <SectionHeading eyebrow={HOW_IT_WORKS.eyebrow} title={HOW_IT_WORKS.title} />
      <Rail className="mt-12 max-w-2xl">
        {HOW_IT_WORKS.steps.map((step) => (
          <RailStep key={step.n} n={step.n} title={step.title} body={step.body} />
        ))}
      </Rail>
    </Section>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter web test && pnpm typecheck`
Expected: PASS.

Confirm in the browser that the three steps read as a single vertical sequence on a hairline, with no bordered cards.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/sections/how-it-works.tsx
git commit -m "feat(web): render pipeline steps on the rail"
```

---

## Task 7: Fold the proof stats into Why Evidence

**Files:**
- Modify: `apps/web/components/sections/why-evidence.tsx`
- Modify: `apps/web/components/sections/stat-counter.tsx`
- Modify: `apps/web/app/page.tsx`
- Delete: `apps/web/components/sections/proof-bar.tsx`

**Interfaces:**
- Consumes: `getLandingStats` from `@/lib/landing-stats`, `StatCounter`, `PROOF_BAR` and `WHY_EVIDENCE` from content.
- Produces: `WhyEvidence` becomes an **async server component**. `app/page.tsx` already renders it inside `<main>`, so no caller change is needed beyond removing `<ProofBar />`.

`getLandingStats()` returns `null` below a data floor. That behaviour is preserved for the stats block only — the comparison always renders. (The spec logs the silent-failure question as out of scope.)

- [ ] **Step 1: Strip StatCounter's card chrome**

In `apps/web/components/sections/stat-counter.tsx`, replace the returned wrapper (lines 41-50) with:

```tsx
  return (
    <div ref={ref}>
      <div className="font-mono text-3xl font-semibold tracking-tight text-chart-1 tabular-nums">
        {display.toLocaleString("en-US")}
      </div>
      <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
```

The count-up effect above is unchanged.

- [ ] **Step 2: Rewrite Why Evidence**

Replace `apps/web/components/sections/why-evidence.tsx` entirely:

```tsx
import { Section, SectionHeading } from "@/components/section";
import { StatCounter } from "@/components/sections/stat-counter";
import { getLandingStats } from "@/lib/landing-stats";
import { PROOF_BAR, WHY_EVIDENCE } from "@/lib/content";

export async function WhyEvidence() {
  const stats = await getLandingStats();

  return (
    <Section>
      <SectionHeading
        eyebrow={WHY_EVIDENCE.eyebrow}
        title={WHY_EVIDENCE.title}
        intro={WHY_EVIDENCE.intro}
      />

      {/* Hairline comparison table, not two cards. The right column is
          emphasised by weight and a single rule, not by a border box. */}
      <div className="mt-12">
        <div className="grid grid-cols-2 gap-x-8 border-b border-border pb-3 sm:gap-x-16">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
            {WHY_EVIDENCE.generatedLabel}
          </h3>
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-chart-1">
            {WHY_EVIDENCE.oursLabel}
          </h3>
        </div>
        {WHY_EVIDENCE.rows.map((r) => (
          <div
            key={r.ours}
            className="grid grid-cols-2 gap-x-8 border-b border-border/50 py-4 last:border-b-0 sm:gap-x-16"
          >
            <p className="text-sm leading-relaxed text-muted-foreground/70">{r.generated}</p>
            <p className="text-sm leading-relaxed">{r.ours}</p>
          </div>
        ))}
      </div>

      {/* The numbers argue for the column on the right, so they live here
          rather than floating on their own after the hero. */}
      {stats ? (
        <div
          aria-label={PROOF_BAR.ariaLabel}
          className="mt-14 grid gap-8 border-t border-border pt-8 sm:grid-cols-3"
        >
          <StatCounter value={stats.postsScanned} label={PROOF_BAR.postsLabel} />
          <StatCounter value={stats.ideasPublished} label={PROOF_BAR.ideasLabel} />
          <StatCounter value={stats.sources} label={PROOF_BAR.sourcesLabel} />
        </div>
      ) : null}
    </Section>
  );
}
```

- [ ] **Step 3: Remove the ProofBar section**

```bash
rm apps/web/components/sections/proof-bar.tsx
```

In `apps/web/app/page.tsx`, remove the `ProofBar` import and `<ProofBar />`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter web test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/sections/why-evidence.tsx apps/web/components/sections/stat-counter.tsx apps/web/components/sections/proof-bar.tsx apps/web/app/page.tsx
git commit -m "feat(web): fold proof stats into the evidence argument"
```

---

## Task 8: Final section order, rhythm pass, and full verification

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/sections/final-cta.tsx`

**Interfaces:**
- Consumes: every section from Tasks 1-7. Produces: the finished page.

- [ ] **Step 1: Set the final page composition**

Replace `apps/web/app/page.tsx` entirely:

```tsx
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/sections/hero";
import { Specimen } from "@/components/sections/specimen";
import { Dissection } from "@/components/sections/dissection";
import { HowItWorks } from "@/components/sections/how-it-works";
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
        <Specimen />
        <Dissection />
        <HowItWorks />
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

- [ ] **Step 2: Open up the final CTA**

In `apps/web/components/sections/final-cta.tsx`, add `density="open"` to its `<Section>` element. The hero and the final CTA are the only two sections that get generous vertical space.

Then terminate the rail above the heading — a short hairline ending in a node, so the page's connective tissue visibly stops here rather than just running out. Add this as the first child inside the `<Section>`, before the existing heading:

```tsx
      <div aria-hidden className="mx-auto mb-14 flex w-px flex-col items-center">
        <span className="h-20 w-px bg-gradient-to-b from-transparent to-border" />
        <span className="size-1.5 rounded-full bg-chart-1 ring-4 ring-background" />
      </div>
```

- [ ] **Step 3: Confirm no dangling references**

```bash
grep -rn "ProofBar\|<Anatomy\|<Problem\|ANATOMY\|PROBLEM" apps/web --include=*.tsx --include=*.ts
```

Expected: no matches. If any appear, remove them before continuing.

- [ ] **Step 4: Full verification**

```bash
pnpm --filter web test
pnpm typecheck
DATABASE_URL=<url> pnpm build
```

Expected: all tests pass, no type errors, build exits 0.

- [ ] **Step 5: Manual acceptance pass**

With `pnpm dev` running, verify against the spec's goals:

1. A scored idea card is visible within the first scroll.
2. No section is separated from its neighbours by an empty screen.
3. The specimen card is the only glowing bordered card on the page.
4. Reduced motion: full page renders composed and readable, nothing mid-animation.
5. 320px: no horizontal scroll anywhere.
6. Keyboard: tab through header nav, both hero CTAs, FAQ `<summary>` toggles, and the pricing CTA. Focus rings visible throughout.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/page.tsx apps/web/components/sections/final-cta.tsx
git commit -m "feat(web): finalise landing page composition and rhythm"
```

---

## Spec Coverage

| Spec requirement | Task |
|---|---|
| Hero un-carded, full-bleed field | 5 |
| Specimen section (new) | 3 |
| Dissection with sticky + scroll tracking (new) | 4 |
| How-it-works on the rail | 6 |
| Why-evidence redesigned, off the card primitive | 7 |
| Proof bar relocated into 05 | 7 |
| Pricing kept | — (unchanged by design) |
| FAQ kept | — (unchanged by design) |
| Final CTA tightened / rail terminus | 8 |
| Problem section dropped | 1 |
| Anatomy absorbed | 4 |
| `--chart-1` for numeric emphasis | 3, 7 |
| Specimen is the only bordered card | 3, 6, 7 |
| Variable vertical rhythm | 2, 3, 4, 6, 8 |
| No new dependency | all |
| `prefers-reduced-motion` gating | 4 |
| Mobile stacking below `lg` | 4 |
| `EXAMPLE ENTRY` tag + non-linked evidence | 1 (test), 3 (render) |
| Content tests updated | 1 |
