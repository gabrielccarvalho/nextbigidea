import { Section, SectionHeading } from "@/components/section";
import { SpecimenCard } from "@/components/specimen-card";
import { SPECIMEN } from "@/lib/content";

export function Specimen() {
  return (
    <Section id="specimen" density="tight">
      <SectionHeading
        eyebrow={SPECIMEN.eyebrow}
        title={SPECIMEN.sectionTitle}
        intro={SPECIMEN.intro}
      />
      <div className="mt-10 max-w-2xl">
        <SpecimenCard />
      </div>
    </Section>
  );
}
