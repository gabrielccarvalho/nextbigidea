import Link from "next/link";
import type { Idea } from "@workspace/db";
import { IDEAS_PAGE, IDEA_LABELS } from "@/lib/content";
import { formatMoneyRange } from "@/lib/format";

// Full card — used for free ideas and for paid viewers only. Callers must
// never render this for an idea the viewer has not unlocked; locked ideas
// are represented only by the data-free LockedBlocker.
//
// Visually this is the landing page's SpecimenCard, condensed: same mono
// microtype labels (shared via IDEA_LABELS), same tabular numbers, same
// hairline stat row. The landing sells that card as "what you're buying" —
// the catalog has to deliver it.
export function IdeaCard({ idea }: { idea: Idea }) {
  return (
    <Link
      href={`/ideas/${idea.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-0.5 hover:border-chart-1/40 hover:bg-chart-1/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-1 items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          {/* Niches come from the enrichment model and can run long; the
              eyebrow is a scent, not a sentence — one line, truncated. */}
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate font-mono text-[0.6rem] uppercase tracking-[0.16em] text-chart-1">
              {idea.niche}
            </span>
            {idea.isFree && (
              <span className="shrink-0 whitespace-nowrap rounded border border-chart-1/40 px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-chart-1">
                {IDEAS_PAGE.freeTag}
              </span>
            )}
          </div>
          <h3 className="mt-1.5 font-semibold leading-snug tracking-tight">{idea.title}</h3>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {idea.oneLiner}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-mono text-3xl font-bold leading-none tracking-tight text-chart-1 tabular-nums">
            {idea.demandScore}
          </div>
          <div className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground">
            {IDEA_LABELS.score}
          </div>
          <div className="ml-auto mt-1.5 h-0.5 w-12 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-chart-1" style={{ width: `${idea.demandScore}%` }} />
          </div>
        </div>
      </div>

      {/* Opaque cells over gap-px paint the hairline dividers; they also keep
          the hover wash confined to the header, like the specimen's tint. */}
      <dl className="grid grid-cols-2 gap-px border-t border-border bg-border">
        <div className="flex flex-col-reverse gap-0.5 bg-background px-5 py-3">
          <dt className="font-mono text-[0.55rem] uppercase tracking-[0.17em] text-muted-foreground">
            {IDEA_LABELS.asks}
          </dt>
          <dd className="font-mono text-sm font-semibold tabular-nums">{idea.askCount}</dd>
        </div>
        <div className="flex flex-col-reverse gap-0.5 bg-background px-5 py-3">
          <dt className="font-mono text-[0.55rem] uppercase tracking-[0.17em] text-muted-foreground">
            {IDEA_LABELS.mrr}
          </dt>
          <dd className="font-mono text-sm font-semibold tabular-nums">
            {formatMoneyRange(idea.mrrLow, idea.mrrHigh)}
          </dd>
        </div>
      </dl>
    </Link>
  );
}
