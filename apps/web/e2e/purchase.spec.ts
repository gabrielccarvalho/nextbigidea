import { expect, test } from "@playwright/test";
import { PAYWALL_CTA } from "@/lib/content";
import { PRICE_CENTS } from "@/lib/payments/provider";
import { E2E, readRun } from "./support/fixtures";
import { E2E_BASE_URL } from "./support/env";
import { sql } from "./support/sql";
import {
  chargePartiallyRefunded,
  chargeRefunded,
  checkoutSessionCompleted,
  postWebhook,
} from "./support/webhook";

/**
 * The complete purchase flow: signed-in viewer → real Stripe Checkout Session → payment webhook
 * → unlocked content → refund → locked again.
 *
 * WHAT IS REAL HERE (and why it matters): step 2 performs a genuine
 * `POST https://api.stripe.com/v1/checkout/sessions` against the test key in apps/web/.env,
 * using the configured STRIPE_PRICE_ID. This is the step an earlier version of this suite
 * skipped — it POSTed straight to the webhook — which is exactly why a misconfigured product id
 * shipped while the tests were green. Anything that mocks the provider here gives that class of
 * bug a place to hide again. It also exercises assertPriceMatches(), so a Price edited in
 * Stripe's dashboard to something other than PRICE_CENTS fails the suite rather than production.
 *
 * WHAT IS SIMULATED, and why:
 *  - The OAuth handshake. Google blocks automated browsers, so global-setup mints the session
 *    row and signs the cookie the same way Better Auth does. Every check downstream of the
 *    handshake — signature verification, session lookup, `getViewerAccess` — runs for real.
 *  - Typing a card into Stripe's hosted page. That page is Stripe's, not ours. The browser's
 *    navigation to it is stubbed and the `checkout.session.completed` callback is delivered to
 *    our webhook with a REAL SDK-generated signature, for the REAL session id the API just
 *    returned — not an invented one.
 *
 * SIDE EFFECT: each run creates a real test-mode Checkout Session in the Stripe dashboard. No
 * money moves (the key is `sk_test_…`/`rk_test_…`), but they do accumulate.
 */

const IDEAS = "/ideas";

test.describe("purchase flow", () => {
  test("a signed-in viewer pays and unlocks the full database", async ({ page }) => {
    const run = readRun();

    // Stripe's hosted checkout is a third-party page with nothing for us to assert on. Stub the
    // browser's navigation to it — the server-side API call that produced this URL has already
    // happened and is what the test is really about.
    await page.route("https://checkout.stripe.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>Stripe hosted checkout (stubbed)</h1></body></html>",
      }),
    );

    // ---- 1. Signed in, but has not paid: the idea is locked. ---------------------------------
    await page.goto(IDEAS);

    // A viewer without access gets NO information about locked ideas — not even the title.
    // The LockedBlocker renders decorative skeletons plus the paywall CTA, nothing more, so
    // both fields being absent is a real assertion about access, not about styling.
    await expect(page.getByText(E2E.ideaTitle, { exact: true })).toHaveCount(0);
    await expect(page.getByText(E2E.ideaOneLiner)).toHaveCount(0);
    await expect(page.getByRole("button", { name: PAYWALL_CTA.ctaAuthenticated })).toBeVisible();

    // ---- 2. Start checkout. THIS is the step that calls Stripe for real. ----------------------
    // The response body must be captured HERE, inside the route handler, rather than via
    // `waitForResponse(...).json()`. On success the page immediately does
    // `window.location.href = url`, and Chromium discards the body of a response belonging to a
    // navigated-away-from document — reading it afterwards fails with "No resource with given
    // identifier found" regardless of whether checkout succeeded.
    let settle: (v: { status: number; body: string }) => void;
    const checkoutCall = new Promise<{ status: number; body: string }>((r) => {
      settle = r;
    });
    await page.route("**/api/payments/checkout", async (route) => {
      const response = await route.fetch();
      const payload = { status: response.status(), body: await response.text() };
      settle(payload);
      await route.fulfill({
        status: payload.status,
        headers: response.headers(),
        body: payload.body,
      });
    });

    await page.getByRole("button", { name: PAYWALL_CTA.ctaAuthenticated }).click();
    const checkout = await checkoutCall;

    // A failure here is the whole point of the suite. Surface the provider's own error text
    // instead of a bare `expect(200)` — Stripe's message names the exact misconfiguration.
    expect(
      checkout.status,
      `POST /api/payments/checkout failed (body: ${checkout.body}). A 500 here usually means ` +
        `STRIPE_PRICE_ID is unset, archived, or priced differently from PRICE_CENTS — check the ` +
        `dev server log for Stripe's error.`,
    ).toBe(200);

    const body = JSON.parse(checkout.body) as {
      url?: string;
      alreadyActive?: boolean;
      pendingCheckout?: boolean;
    };
    // Guard the "succeeded but did nothing" shapes: both are 200s that would sail past a bare
    // status assertion while no Checkout Session was ever created.
    expect(body.alreadyActive, "test user should not already have access").toBeFalsy();
    expect(body.pendingCheckout, "test user should not have an in-flight checkout").toBeFalsy();
    expect(body.url, "checkout should return a hosted-checkout URL").toMatch(
      /^https:\/\/checkout\.stripe\.com\//,
    );

    // The browser follows the URL; the stub above answers.
    await page.waitForURL(/checkout\.stripe\.com/);

    // ---- 3. The checkout was recorded as pending, against our user. --------------------------
    const pending = await sql<{
      status: string;
      user_id: string;
      amount_cents: string;
      currency: string;
      provider: string;
      provider_charge_id: string;
    }>(
      `select status, user_id, amount_cents, currency, provider, provider_charge_id
         from purchases where user_id = $1`,
      [run.userId],
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]!.status).toBe("pending");
    expect(pending[0]!.provider).toBe("stripe");
    expect(pending[0]!.currency).toBe("USD");
    expect(Number(pending[0]!.amount_cents)).toBe(PRICE_CENTS);

    // The session id came from Stripe, not from us — assert it is the real thing.
    const sessionId = pending[0]!.provider_charge_id;
    expect(sessionId).toMatch(/^cs_/);

    // ---- 4. Stripe confirms the payment. -----------------------------------------------------
    const paymentIntentId = `pi_e2e_${run.runId}`;
    const hook = await postWebhook(
      checkoutSessionCompleted({
        sessionId,
        paymentIntentId,
        userId: run.userId,
        amountCents: PRICE_CENTS,
      }),
    );
    expect(hook.status, `webhook rejected: ${hook.body}`).toBe(200);

    const paid = await sql<{ status: string; provider_payment_intent_id: string | null }>(
      `select status, provider_payment_intent_id from purchases where provider_charge_id = $1`,
      [sessionId],
    );
    expect(paid[0]!.status).toBe("paid");
    // The PaymentIntent id is the ONLY join key a later refund carries — losing it here would
    // silently make every refund unresolvable.
    expect(paid[0]!.provider_payment_intent_id).toBe(paymentIntentId);

    // ---- 5. The content is unlocked in the browser. ------------------------------------------
    // The paid view is paginated 20 per page; the seeded idea (demand 82) is expected on
    // page 1 of the near-empty e2e database.
    await page.goto(IDEAS);
    await expect(page.getByText(E2E.ideaTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(E2E.ideaOneLiner)).toBeVisible();
    // The paywall CTA is gone once access is granted.
    await expect(page.getByRole("button", { name: PAYWALL_CTA.ctaAuthenticated })).toHaveCount(0);

    // ---- 6. A PARTIAL refund must NOT revoke access. -----------------------------------------
    // `charge.refunded` fires for partial refunds too, with `refunded: false`. Getting this
    // backwards would silently cut off a customer who received a goodwill partial refund.
    const partial = await postWebhook(
      chargePartiallyRefunded({ paymentIntentId, amountCents: PRICE_CENTS }),
    );
    expect(partial.status, `partial refund rejected: ${partial.body}`).toBe(200);

    const afterPartial = await sql<{ status: string }>(
      `select status from purchases where provider_charge_id = $1`,
      [sessionId],
    );
    expect(afterPartial[0]!.status, "a partial refund must not revoke access").toBe("paid");

    await page.goto(IDEAS);
    await expect(page.getByText(E2E.ideaTitle, { exact: true })).toBeVisible();

    // ---- 7. A FULL refund revokes access. ----------------------------------------------------
    const refund = await postWebhook(
      chargeRefunded({ paymentIntentId, amountCents: PRICE_CENTS }),
    );
    expect(refund.status, `refund rejected: ${refund.body}`).toBe(200);

    const refunded = await sql<{ status: string }>(
      `select status from purchases where provider_charge_id = $1`,
      [sessionId],
    );
    expect(refunded[0]!.status).toBe("refunded");

    // Access is "any row with status = 'paid'", so the refunded row stops granting immediately.
    await page.goto(IDEAS);
    await expect(page.getByText(E2E.ideaTitle, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: PAYWALL_CTA.ctaAuthenticated })).toBeVisible();
  });
});

test.describe("webhook authentication", () => {
  test("an unsigned webhook is rejected without touching the database", async () => {
    const res = await fetch(`${E2E_BASE_URL}/api/payments/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        checkoutSessionCompleted({
          sessionId: "cs_forged",
          paymentIntentId: "pi_forged",
          userId: readRun().userId,
          amountCents: PRICE_CENTS,
        }),
      ),
    });
    // 400, not 500 and not 200: verification failure is permanent, so Stripe must not retry.
    expect(res.status).toBe(400);

    const forged = await sql<{ count: string }>(
      `select count(*) as count from purchases where provider_charge_id = $1`,
      ["cs_forged"],
    );
    expect(Number(forged[0]!.count), "a forged webhook must write nothing").toBe(0);
  });
});

test.describe("signed out", () => {
  // Drop the forged session cookie for this block only.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a signed-out visitor is routed to sign in before checkout", async ({ page }) => {
    await page.goto(IDEAS);

    // No checkout button at all — signed-out users get a link to /login instead of a
    // checkout call that would 401.
    await expect(page.getByRole("button", { name: PAYWALL_CTA.ctaAuthenticated })).toHaveCount(0);

    await page.getByRole("link", { name: "Sign in to unlock" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fideas/);
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
  });
});
