import { Section, SectionHeading } from "@/components/section";
import { PRICING, PRICING_SECTION } from "@/lib/content";
import { PaywallCta } from "@/components/paywall-cta";
import { getViewerAccess } from "@/lib/viewer-access";

export async function Pricing() {
  const access = await getViewerAccess();

  return (
    <Section id="pricing">
      <SectionHeading
        eyebrow={PRICING_SECTION.eyebrow}
        title={PRICING_SECTION.title}
        align="center"
      />
      <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-8">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
            {PRICING_SECTION.free.name}
          </h3>
          <p className="mt-4 text-3xl font-bold tracking-tight">{PRICING_SECTION.free.price}</p>
          <ul className="mt-6 space-y-2">
            {PRICING_SECTION.free.items.map((item) => (
              <li key={item} className="text-sm text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-primary/50 bg-card p-8 shadow-[0_0_40px_-12px_var(--primary)]">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-primary">
            {PRICING_SECTION.paid.name}
          </h3>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">{PRICING.amountBRL}</span>
            <span className="text-muted-foreground">/{PRICING.term}</span>
          </p>
          <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
            {PRICING.amountUSDApprox}
          </p>
          <ul className="mt-6 space-y-2">
            {PRICING_SECTION.paid.items.map((item) => (
              <li key={item} className="text-sm">
                {item}
              </li>
            ))}
          </ul>

          {/* Renewal and cancellation terms are disclosed before purchase, not
              only in the Terms of Service. */}
          <ul className="mt-6 space-y-1 border-t border-border pt-4">
            {PRICING_SECTION.terms.map((term) => (
              <li key={term} className="text-[0.7rem] leading-relaxed text-muted-foreground">
                {term}
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <PaywallCta authenticated={access.userId != null} />
          </div>
        </div>
      </div>
    </Section>
  );
}
