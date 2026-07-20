import { Section } from "@/components/section";
import { StatCounter } from "@/components/sections/stat-counter";
import { getLandingStats } from "@/lib/landing-stats";
import { PROOF_BAR } from "@/lib/content";

export async function ProofBar() {
  const stats = await getLandingStats();

  // Below the floor the section does not render at all. An absent stat bar is
  // neutral; a weak one actively undersells the product.
  if (!stats) return null;

  return (
    <Section className="py-12 sm:py-14" ariaLabel={PROOF_BAR.ariaLabel}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCounter value={stats.postsScanned} label={PROOF_BAR.postsLabel} />
        <StatCounter value={stats.ideasPublished} label={PROOF_BAR.ideasLabel} />
        <StatCounter value={stats.sources} label={PROOF_BAR.sourcesLabel} />
      </div>
    </Section>
  );
}
