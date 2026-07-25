import Link from "next/link";
import type { Idea } from "@workspace/db";

// Full card — used for free ideas and for paid viewers only. Callers must
// never render this for an idea the viewer has not unlocked; locked ideas
// are represented only by the data-free LockedBlocker.
export function IdeaCard({ idea }: { idea: Idea }) {
  return (
    <Link
      href={`/ideas/${idea.slug}`}
      className="block rounded-lg border p-4 transition hover:border-foreground/40"
    >
      <div className="mb-1 text-xs uppercase text-muted-foreground">{idea.niche}</div>
      <h3 className="font-semibold">{idea.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{idea.oneLiner}</p>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span>Demand {idea.demandScore}/100</span>
        <span>
          ~${idea.mrrLow}–${idea.mrrHigh} MRR
        </span>
        <span>{idea.askCount} asks</span>
      </div>
    </Link>
  );
}
