import Link from "next/link";
import { Section, SectionHeading } from "@/components/section";
import { FINAL_CTA } from "@/lib/content";

export function FinalCta() {
  return (
    <Section className="text-center">
      <SectionHeading title={FINAL_CTA.title} align="center" />
      <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{FINAL_CTA.body}</p>
      <Link
        href={FINAL_CTA.href}
        className="mt-8 inline-block rounded-md bg-primary px-8 py-3.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {FINAL_CTA.cta} &rarr;
      </Link>
    </Section>
  );
}
