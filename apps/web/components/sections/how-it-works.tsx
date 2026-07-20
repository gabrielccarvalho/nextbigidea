import { Rail, RailStep, Section, SectionHeading } from "@/components/section";
import { HOW_IT_WORKS } from "@/lib/content";

export function HowItWorks() {
  return (
    <Section id="how-it-works" density="tight">
      <SectionHeading eyebrow={HOW_IT_WORKS.eyebrow} title={HOW_IT_WORKS.title} />
      <Rail className="mt-12 max-w-2xl">
        {HOW_IT_WORKS.steps.map((step) => (
          <RailStep key={step.n} n={step.n} title={step.title} body={step.body} />
        ))}
      </Rail>
    </Section>
  );
}
