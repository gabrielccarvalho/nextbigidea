import { Section, SectionHeading } from "@/components/section";
import { HOW_IT_WORKS } from "@/lib/content";

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading eyebrow={HOW_IT_WORKS.eyebrow} title={HOW_IT_WORKS.title} />
      <ol className="mt-12 grid gap-6 sm:grid-cols-3">
        {HOW_IT_WORKS.steps.map((step) => (
          <li key={step.n} className="rounded-xl border border-border bg-card p-6">
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-primary">
              {step.n}
            </span>
            <h3 className="mt-3 text-lg font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
