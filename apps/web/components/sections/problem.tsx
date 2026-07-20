import { Section, SectionHeading } from "@/components/section";
import { PROBLEM } from "@/lib/content";

export function Problem() {
  return (
    <Section>
      <SectionHeading eyebrow={PROBLEM.eyebrow} title={PROBLEM.title} intro={PROBLEM.body} />
    </Section>
  );
}
