import { Section } from "@/components/section";
import { StatCounter } from "@/components/sections/stat-counter";
import { getLandingStats } from "@/lib/landing-stats";

export async function ProofBar() {
  const stats = await getLandingStats();

  // Below the floor the section does not render at all. An absent stat bar is
  // neutral; a weak one actively undersells the product.
  if (!stats) return null;

  return (
    <Section className="py-12 sm:py-14">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCounter value={stats.postsScanned} label="posts read" />
        <StatCounter value={stats.ideasPublished} label="ideas published" />
        <StatCounter value={stats.sources} label="sources" />
      </div>
    </Section>
  );
}
