import { Section, SectionHeading } from "@/components/section";
import { FAQ } from "@/lib/content";

export function Faq() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow={FAQ.eyebrow} title={FAQ.title} />
      <div className="mt-12 divide-y divide-border border-y border-border">
        {FAQ.items.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {item.q}
              <span
                aria-hidden
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
