import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { COMPANY } from "@/lib/content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${COMPANY.name} handles your data.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="The short version: we collect the minimum needed to sign you in and bill you, we never sell your data, and you can delete your account whenever you want."
    >
      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account data</strong> — your email address, and your name and profile picture if you sign in with Google.</li>
        <li><strong>Payment data</strong> — purchase status and a payment reference. <strong>We never see or store your card number</strong>; our payment processor handles it.</li>
        <li><strong>Technical data</strong> — standard server logs, including IP address and browser type, kept briefly for security and debugging.</li>
      </ul>
      <p>We do not use advertising trackers or third-party analytics cookies.</p>

      <h2>2. How we use it</h2>
      <ul>
        <li>To sign you in and keep your session working.</li>
        <li>To determine whether your access is active.</li>
        <li>To email you about billing and material changes to the service.</li>
        <li>To keep the service secure and diagnose faults.</li>
      </ul>

      <h2>3. What we never do</h2>
      <ul>
        <li>We never sell or rent your personal data.</li>
        <li>We never share it with advertisers.</li>
        <li>We never email you marketing you did not ask for.</li>
      </ul>

      <h2>4. Data we process about third parties</h2>
      <p>
        This is unusual enough to spell out. Our product is built by reading{" "}
        <strong>public posts written by people who are not our users</strong> — on Reddit, Hacker
        News, and Product Hunt. When we store a post we keep its text, its public URL, the public
        username of its author, and public metrics such as upvote counts.
      </p>
      <p>
        We process this under our legitimate interest in identifying product demand, and we limit
        ourselves to content the author chose to publish publicly. We do not attempt to identify
        authors beyond their public username, we do not build profiles of them, and we do not
        contact them.
      </p>
      <p>
        <strong>If you wrote a post we reference and want it removed</strong>, write to{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> and we will delete it and any idea
        that depends on it.
      </p>

      <h2>5. Sub-processors</h2>
      <p>We share the minimum necessary data with:</p>
      <ul>
        <li><strong>AbacatePay</strong> — payment processing.</li>
        <li><strong>Google</strong> — optional sign-in.</li>
        <li><strong>Resend</strong> — transactional and sign-in emails.</li>
        <li><strong>Anthropic</strong> — analysis of public posts. We do not send your personal data to this provider.</li>
        <li><strong>Our database and hosting providers</strong> — storage and serving of the application.</li>
      </ul>

      <h2>6. Retention and deletion</h2>
      <p>
        We keep account data while your account exists. Ask us to delete your account and we remove
        your personal data within 30 days, except records we must keep for tax or accounting
        purposes, which we retain for the period Brazilian law requires. Server logs are kept for a
        short period and then discarded.
      </p>

      <h2>7. Security</h2>
      <p>
        Data is encrypted in transit. Access to production systems is limited to the operator.
        No system is perfectly secure, but we do not retain card data, which removes the most
        sensitive category of risk entirely.
      </p>

      <h2>8. International data transfers</h2>
      <p>
        Some of our providers operate outside Brazil, so your data may be processed abroad. Where
        that happens we rely on the transfer mechanisms permitted by the LGPD and choose providers
        that offer appropriate safeguards.
      </p>

      <h2>9. Children</h2>
      <p>
        The service is not intended for anyone under 18, and we do not knowingly collect data from
        children. If you believe a child has given us data, contact us and we will delete it.
      </p>

      <h2>10. Legal basis and your rights under the LGPD</h2>
      <p>
        {COMPANY.legalName} (CNPJ {COMPANY.cnpj}) is the controller of your personal data. We
        process it on the basis of performing our contract with you (providing and billing the
        service), complying with legal obligations (tax records), and our legitimate interests
        (security, and identifying product demand from public posts).
      </p>
      <p>Under Lei nº 13.709/2018 you may request:</p>
      <ul>
        <li>Confirmation that we process your data, and access to it.</li>
        <li>Correction of incomplete or inaccurate data.</li>
        <li>Anonymisation, blocking, or deletion of unnecessary or excessive data.</li>
        <li>Portability of your data to another provider.</li>
        <li>Deletion of data processed with your consent.</li>
        <li>Information about who we share your data with.</li>
        <li>To object to processing based on legitimate interests.</li>
      </ul>
      <p>
        Write to <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> to exercise any of these;
        that address also reaches our data protection officer. You may also complain to the ANPD,
        the Brazilian data protection authority.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We will update this page if our practices change, and will email registered users before
        any material change takes effect.
      </p>

      <h2>12. Contact</h2>
      <p>
        {COMPANY.legalName} (CNPJ {COMPANY.cnpj}) —{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </p>
    </LegalPage>
  );
}
