/**
 * Operator alerting for payment webhook failures that a database write or DB behavior
 * cannot fix by itself. Without this, an unresolvable webhook (e.g. a renewal that can't
 * be matched to a subscription id) is only visible in server logs — and since renewals
 * happen once a year, a lost subscription id can go unnoticed for a full year, until every
 * renewal for that user starts 503ing.
 *
 * `shouldSendPaymentAlert` and `formatPaymentAlert` are pure — no `@workspace/db` or
 * `resend` import at module scope — so they stay unit-testable without any network or
 * database dependency.
 */
import { Resend } from "resend";

export type PaymentAlertInput = {
  kind: string;
  detail: string;
};

/** Whether an alert should actually be sent, given the configured address (or lack of one). */
export function shouldSendPaymentAlert(alertEmail: string | undefined): boolean {
  return Boolean(alertEmail);
}

/** Renders the subject/body for a payment alert. Pure — no I/O. */
export function formatPaymentAlert(input: PaymentAlertInput): { subject: string; body: string } {
  const detail = input.detail.length > 0 ? input.detail : "(no detail provided)";
  return {
    subject: `[payments] webhook failure: ${input.kind}`,
    body:
      `A payment webhook could not be fully resolved.\n\n` +
      `kind: ${input.kind}\n` +
      `detail: ${detail}\n\n` +
      `This was returned as a 5xx so the provider retries delivery, but if retries are ` +
      `exhausted or the underlying data problem doesn't self-heal, this requires manual ` +
      `investigation.`,
  };
}

/**
 * Sends the alert email for a payment webhook failure. MUST NOT throw under any
 * circumstance: a failing alert must never turn a recoverable webhook (one that returns a
 * 5xx so the provider retries) into an unrecoverable one (one that 500s because sending the
 * alert itself blew up). The send is wrapped in try/catch and failures are logged, not
 * propagated.
 *
 * When `PAYMENT_ALERT_EMAIL` is unset, this is a no-op that still logs — the webhook must
 * keep working fully without an alert address configured.
 */
export async function notifyPaymentFailure(input: PaymentAlertInput): Promise<void> {
  const alertEmail = process.env.PAYMENT_ALERT_EMAIL;

  if (!shouldSendPaymentAlert(alertEmail)) {
    console.error(
      `[payments] alert suppressed (PAYMENT_ALERT_EMAIL unset): ${input.kind} — ${input.detail}`,
    );
    return;
  }

  const { subject, body } = formatPaymentAlert(input);

  try {
    // Constructed lazily, NOT at module scope. `new Resend()` throws synchronously when
    // RESEND_API_KEY is unset, and at module scope that throw fires during `next build`'s
    // page-data collection — failing the ENTIRE app build, not just this route, on any
    // deploy that hasn't set the key yet. Inside this function it can only fail when an
    // alert actually needs to be sent, and that failure is caught below. Mirrors the
    // pattern in lib/auth.ts's sendMagicLink.
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "login@yourdomain.com",
      to: alertEmail!,
      subject,
      text: body,
    });
  } catch (err) {
    console.error(`[payments] failed to send payment alert for ${input.kind}:`, err);
  }
}
