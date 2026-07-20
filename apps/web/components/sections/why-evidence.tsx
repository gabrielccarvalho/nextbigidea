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

      {/* Hairline comparison, not two cards. The right column is emphasised by
          weight and a single rule, not by a border box.

          Each cell carries its own column label, `sm:sr-only`. That does two
          jobs: below `sm` the columns stack and the labels are the only thing
          telling a sighted reader which side a line belongs to, and at every
          width a screen reader hears the attribution per cell. Without it the
          claims read as a flat list of eight unattributed sentences — "Every
          claim links to the post behind it" would sound like a general remark
          rather than this product's column. */}
      <div className="mt-12">
        <div
          aria-hidden
          className="hidden border-b border-border pb-3 sm:grid sm:grid-cols-2 sm:gap-x-16"
        >
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
            {WHY_EVIDENCE.generatedLabel}
          </span>
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-chart-1">
            {WHY_EVIDENCE.oursLabel}
          </span>
        </div>
        {WHY_EVIDENCE.rows.map((r) => (
          <div
            key={r.ours}
            className="grid gap-y-4 border-b border-border/50 py-4 last:border-b-0 sm:grid-cols-2 sm:gap-x-16 sm:gap-y-0"
          >
            <p className="text-sm leading-relaxed text-muted-foreground/70">
              <span className="mb-1.5 block font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground sm:sr-only">
                {WHY_EVIDENCE.generatedLabel}
              </span>
              {r.generated}
            </p>
            <p className="text-sm leading-relaxed">
              <span className="mb-1.5 block font-mono text-[0.55rem] uppercase tracking-[0.16em] text-chart-1 sm:sr-only">
                {WHY_EVIDENCE.oursLabel}
              </span>
              {r.ours}
            </p>
          </div>
        ))}
      </div>

      {/* The numbers argue for the column on the right, so they live here
          rather than floating on their own after the hero. */}
      {stats ? (
        <div
          role="group"
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
