import { Section, SectionHeading } from "@/components/section";
import { ANATOMY } from "@/lib/content";

export function Anatomy() {
  return (
    <Section id="anatomy">
      <SectionHeading eyebrow={ANATOMY.eyebrow} title={ANATOMY.title} intro={ANATOMY.intro} />
      <dl className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
        {ANATOMY.callouts.map((c) => (
          <div key={c.label} className="bg-card p-6">
            <dt className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-primary">
              {c.label}
            </dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-pretty text-lg font-medium">{ANATOMY.closer}</p>
    </Section>
  );
}
