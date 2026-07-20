import type { TeaserIdea } from "@/lib/teaser";

// Locked teaser: ONLY non-sensitive fields (title, niche) are accepted, and
// the prop type enforces that at compile time — callers cannot pass the full
// Idea object here even by mistake. demandScore, MRR, description,
// competitionNotes, validationSignals, and evidence must never reach an
// unpaid visitor, so they must never be constructed into this prop in the
// first place (see app/ideas/page.tsx). The prop is branded (`TeaserIdea`),
// so the only way to produce a value of this type is `toTeaserIdea()` — a
// full `Idea` is structurally incompatible and passing one is a compile
// error, not just a convention.
export function LockedTeaser({ idea }: { idea: TeaserIdea }) {
  return (
    <div className="relative rounded-lg border p-4">
      <div className="mb-1 text-xs uppercase text-muted-foreground">{idea.niche}</div>
      <h3 className="font-semibold">{idea.title}</h3>
      <div className="mt-3 space-y-2" aria-hidden>
        <div className="h-3 w-2/3 rounded bg-foreground/10 blur-[2px]" />
        <div className="h-3 w-1/2 rounded bg-foreground/10 blur-[2px]" />
      </div>
      <div className="mt-3 text-xs font-medium text-muted-foreground">Unlock to view</div>
    </div>
  );
}
