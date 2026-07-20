import { cn } from "@workspace/ui/lib/utils";
import { SOURCES, SPECIMEN } from "@/lib/content";

// Must stay in sync with DISSECTION.steps[].key in lib/content.ts.
export type SpecimenRegion = "score" | "numbers" | "receipts" | "catch" | null;

const SOURCE_COLOR = new Map(SOURCES.map((s) => [s.name, s.color]));

// When `active` is null — mobile, reduced motion, no JS, pre-scroll — every
// region renders at full strength and nothing is emphasised. Emphasis is
// additive on top of that baseline, so the card is never left dimmed with
// nothing lit.
//
// `origin` controls where the scale grows from, so a region expands into its
// own whitespace instead of drifting across the card. Transforms don't reflow,
// so scaling can't shift the regions around it.
const EASE = "transition-all duration-500 ease-out";

// Only `scale` on regions that are INSET from the card's edges. The stat row,
// evidence list and competition block are all full-bleed, and the card is
// `overflow-hidden` — scaling them pushes their edges past the card and gets
// them clipped, which reads as a rendering bug rather than emphasis.
function region(
  active: SpecimenRegion,
  self: SpecimenRegion,
  opts?: { scale?: string },
) {
  // `null` = mobile, reduced motion, no JS, pre-scroll. Everything at full
  // strength, nothing emphasised — the card is never left dimmed with nothing lit.
  if (active === null) return EASE;
  if (active !== self) {
    // Inactive regions recede but stay legible: a spotlight, not a blackout.
    return cn(EASE, "opacity-25");
  }
  return cn(EASE, "opacity-100", opts?.scale && [opts.scale, "scale-[1.06]"]);
}

// Full-bleed blocks can't use scale (they'd overflow the card and be clipped)
// and a 1px ring is invisible at this contrast. An inset left accent bar reads
// clearly on the dark card and costs no layout shift — a real `border-l` would
// push the content 2px sideways every time the highlight moved.
//
// `tint` is off for the stat row: that grid paints its hairline dividers with
// `gap-px` over `bg-border`, so overriding the background erases them.
function panel(active: SpecimenRegion, self: SpecimenRegion, tint = true) {
  if (active !== self) return false;
  return cn(
    "shadow-[inset_2px_0_0_0_var(--color-chart-1)]",
    tint && "bg-chart-1/[0.05]",
  );
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

        <div
          className={cn(
            "shrink-0 text-right",
            region(highlight, "score", { scale: "origin-top-right" }),
          )}
        >
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
          panel(highlight, "numbers", false),
        )}
      >
        {[
          { v: idea.asks, l: labels.asks },
          { v: idea.mrrRange, l: labels.mrr },
          { v: SOURCES.length, l: labels.sources },
        ].map((cell) => (
          <div
            key={cell.l}
            className="flex flex-col-reverse gap-1 bg-background px-4 py-3.5 sm:px-6"
          >
            <dt className="font-mono text-[0.55rem] uppercase tracking-[0.17em] text-muted-foreground">
              {cell.l}
            </dt>
            <dd className="font-mono text-base font-semibold tabular-nums">{cell.v}</dd>
          </div>
        ))}
      </dl>

      <div
        className={cn(
          "p-6",
          region(highlight, "receipts"),
          panel(highlight, "receipts"),
        )}
      >
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

      <div
        className={cn(
          "border-t border-border p-6",
          region(highlight, "catch"),
          panel(highlight, "catch"),
        )}
      >
        <h4 className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground">
          {labels.competition}
        </h4>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{idea.competition}</p>
      </div>
    </article>
  );
}
