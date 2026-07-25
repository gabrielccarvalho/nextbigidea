import { PaywallCta } from "@/components/paywall-cta";
import { IDEAS_PAGE } from "@/lib/content";

// Skeleton bar widths, fixed per card so the grid looks organic without any
// randomness (which would break between server render and hydration).
const CARD_SHAPES = [
  ["w-16", "w-3/4", "w-full", "w-1/2"],
  ["w-12", "w-2/3", "w-5/6", "w-2/5"],
  ["w-20", "w-4/5", "w-full", "w-3/5"],
  ["w-14", "w-1/2", "w-11/12", "w-1/3"],
  ["w-16", "w-2/3", "w-full", "w-1/2"],
  ["w-12", "w-3/4", "w-4/5", "w-2/5"],
] as const;

// What an unpaid viewer sees past the free ideas. Replaces the old per-idea
// LockedTeaser grid, which leaked every locked idea's title and niche. This
// renders NO data at all — the cards are decorative skeletons (shaped like the
// real IdeaCard: eyebrow, title, score block, hairline stat footer) and the
// only real number shown is the count of locked ideas. Keep it that way.
export function LockedBlocker({
  lockedCount,
  authenticated,
}: {
  lockedCount: number;
  authenticated: boolean;
}) {
  return (
    <section className="relative mt-4">
      <div aria-hidden className="grid gap-4 sm:grid-cols-2">
        {CARD_SHAPES.map((widths, i) => (
          <div key={i} className="overflow-hidden rounded-xl border">
            <div className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className={`h-2.5 ${widths[0]} rounded bg-foreground/10 blur-[2px]`} />
                <div className={`mt-2.5 h-4 ${widths[1]} rounded bg-foreground/15 blur-[2px]`} />
                <div className="mt-2.5 space-y-2">
                  <div className={`h-3 ${widths[2]} rounded bg-foreground/10 blur-[2px]`} />
                  <div className={`h-3 ${widths[3]} rounded bg-foreground/10 blur-[2px]`} />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <div className="h-8 w-12 rounded bg-chart-1/20 blur-[3px]" />
                <div className="mt-1.5 h-2 w-10 rounded bg-foreground/10 blur-[2px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px border-t border-border bg-border">
              <div className="bg-background px-5 py-3">
                <div className="h-3 w-14 rounded bg-foreground/10 blur-[2px]" />
              </div>
              <div className="bg-background px-5 py-3">
                <div className="h-3 w-16 rounded bg-foreground/10 blur-[2px]" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-background/40 via-background/85 to-background px-4">
        {lockedCount > 0 && (
          <p className="text-sm font-medium">
            {lockedCount} {IDEAS_PAGE.lockedCountSuffix}
          </p>
        )}
        <div className="w-full max-w-md">
          <PaywallCta authenticated={authenticated} />
        </div>
      </div>
    </section>
  );
}
