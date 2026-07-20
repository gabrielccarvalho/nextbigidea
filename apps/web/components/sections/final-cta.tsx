import Link from "next/link";
import { Section, SectionHeading } from "@/components/section";
import { FINAL_CTA } from "@/lib/content";

export function FinalCta() {
  return (
    <Section density="open" className="text-center">
      <div aria-hidden className="mx-auto mb-14 flex w-px flex-col items-center">
        <span className="h-20 w-px bg-gradient-to-b from-transparent to-border" />
        <span className="size-1.5 rounded-full bg-chart-1 ring-4 ring-background" />
      </div>
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
