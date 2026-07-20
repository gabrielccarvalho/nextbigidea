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
