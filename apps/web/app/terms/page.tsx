import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { COMPANY, PRICING } from "@/lib/content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your use of ${COMPANY.name}.`,
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms govern your use of ${COMPANY.name}, operated by ${COMPANY.legalName} (CNPJ ${COMPANY.cnpj}). Plain English, no surprises.`}
    >
      <h2>1. The service</h2>
      <p>
        {COMPANY.name} publishes a database of software product ideas. Each idea is derived from
        public posts on Reddit, Hacker News, and Product Hunt in which people describe a product
        they want but cannot find. We group related posts, score the strength of the demand, and
        link every idea back to the posts it came from.
      </p>
      <p>
        <strong>We report demand. We do not promise outcomes.</strong> An idea with a high demand
        score means many people asked for something similar. It does not mean a business built on
        it will succeed, and we make no representation that it will.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <p>
        You must be at least 18 years old and able to enter a binding contract. You are responsible
        for activity under your account and for keeping your sign-in method secure. Accounts are
        personal — do not share your access with others.
      </p>

      <h2>3. Payment and billing</h2>
      <p>
        Full access costs {PRICING.amountBRL} ({PRICING.amountUSDApprox}), charged once to a
        payment card. Prices are stated and charged in Brazilian reais; any figure shown in
        another currency is an approximation for reference only, and the amount billed will be
        in reais.
      </p>
      <ul>
        <li>
          <strong>You pay once.</strong> There is no recurring charge, and we will not bill you
          again unless you choose to make another purchase.
        </li>
        <li>One payment covers every idea published so far and every idea we publish after, for as long as we operate the service.</li>
        <li>If we change the price, the new price applies only to purchases made after the change.</li>
      </ul>
      <p>
        {PRICING.freeIdeaCount} ideas are free to read without any payment or account.
      </p>

      <h2>4. Refunds</h2>
      <p>
        You may undo your purchase within {PRICING.refundDays} days and receive a full refund,
        for any reason or none. This reflects your right of regret under Article 49 of the
        Brazilian Consumer Protection Code (Lei nº 8.078/1990). Write to{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> and we will process it.
      </p>

      <h2>5. What you may and may not do with the ideas</h2>
      <p>
        <strong>You may build anything you find here.</strong> The ideas are not exclusive, we
        claim no ownership of what you create, and we ask for no share of it. Everyone who has
        paid sees the same ideas — you are paying for the evidence, not for exclusivity.
      </p>
      <p>You may not:</p>
      <ul>
        <li>Republish, resell, or redistribute the idea database or substantial parts of it.</li>
        <li>Scrape or bulk-export the content, or use automated means to access it beyond normal reading.</li>
        <li>Share your account so that people who have not paid can read the paid ideas.</li>
      </ul>

      <h2>6. Source content and third-party rights</h2>
      <p>
        Ideas are derived from posts written by other people on platforms we do not control.{" "}
        <strong>That source content belongs to its authors and to the platforms that host it</strong> —
        not to us, and not to you. We quote briefly and link back so you can read the original.
      </p>
      <p>
        What we do claim rights in is our own work: the grouping, the scoring, the written analysis,
        and the database as a whole. If you are the author of a post and would rather not be
        referenced, write to <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> and we will
        remove it.
      </p>

      <h2>7. Acceptable use</h2>
      <p>
        Do not attempt to break, overload, or gain unauthorised access to the service; do not probe
        or scan our infrastructure; and do not use the service to break the law.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        We rely on third parties to operate: a payment processor, a database host, an email
        provider, an authentication provider, an AI provider that helps analyse posts, and a
        hosting provider. Their handling of data is described in our{" "}
        <a href="/privacy">Privacy Policy</a>. Their own failures or outages are not within our
        control.
      </p>

      <h2>9. Availability</h2>
      <p>
        We aim to keep the service running but do not guarantee uninterrupted availability. We may
        change, suspend, or discontinue features. New ideas are published on a monthly cadence; we
        do not guarantee a specific number of ideas in any given period.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        The service is provided &ldquo;as is&rdquo;. We do not warrant that the demand scores,
        revenue estimates, or competition notes are accurate, complete, or suitable for any
        decision you make. <strong>Revenue figures are estimates presented as ranges, not
        forecasts.</strong> Business decisions you make based on this material are yours.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, our total liability arising out of or relating to
        the service is limited to the greater of the amount you paid us in the twelve months before
        the claim, or USD 50. We are not liable for lost profits, lost business, or indirect or
        consequential damages. Nothing here limits liability that cannot be limited under Brazilian
        consumer law.
      </p>

      <h2>12. Termination</h2>
      <p>
        You may stop using the service at any time. We may suspend or terminate access if you
        breach these terms — in which case we will refund what you paid, unless the breach
        involved redistribution or abuse of the service.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms. If a change materially affects your rights, we will notify you
        by email before it takes effect. Continuing to use the service after that means you accept
        the updated terms.
      </p>

      <h2>14. Governing law and venue</h2>
      <p>
        These terms are governed by the laws of {COMPANY.governingLaw}. Disputes are subject to{" "}
        {COMPANY.jurisdictionForum}, except where consumer law entitles you to bring a claim where
        you live.
      </p>

      <h2>15. Contact</h2>
      <p>
        {COMPANY.legalName} (CNPJ {COMPANY.cnpj}) —{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </p>
    </LegalPage>
  );
}
