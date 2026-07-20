import { Section, SectionHeading } from "@/components/section";
import { WHY_EVIDENCE } from "@/lib/content";

export function WhyEvidence() {
  return (
    <Section>
      <SectionHeading
        eyebrow={WHY_EVIDENCE.eyebrow}
        title={WHY_EVIDENCE.title}
        intro={WHY_EVIDENCE.intro}
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-6">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
            {WHY_EVIDENCE.generatedLabel}
          </h3>
          <ul className="mt-4 space-y-3">
            {WHY_EVIDENCE.rows.map((r) => (
              <li key={r.generated} className="text-sm leading-relaxed text-muted-foreground">
                {r.generated}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-primary/40 bg-card p-6">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-primary">
            {WHY_EVIDENCE.oursLabel}
          </h3>
          <ul className="mt-4 space-y-3">
            {WHY_EVIDENCE.rows.map((r) => (
              <li key={r.ours} className="text-sm leading-relaxed">
                {r.ours}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
