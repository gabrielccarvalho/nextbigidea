import { cn } from "@workspace/ui/lib/utils";
import { SOURCES, SPECIMEN } from "@/lib/content";

// Must stay in sync with DISSECTION.steps[].key in lib/content.ts.
export type SpecimenRegion = "score" | "numbers" | "receipts" | "catch" | null;

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
