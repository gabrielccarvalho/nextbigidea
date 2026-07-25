import { expect, test } from "@playwright/test";
import { PAYWALL_CTA } from "@/lib/content";
import { E2E, readRun } from "./support/fixtures";
import { sql } from "./support/sql";
import { postWebhook, subscriptionCompleted } from "./support/webhook";

/**
 * The complete purchase flow: signed-in viewer → live AbacatePay subscription checkout →
 * payment webhook → unlocked content.
 *
 * WHAT IS REAL HERE (and why it matters): step 2 performs a genuine
 * `POST https://api.abacatepay.com/v2/subscriptions/create` against the dev API key in
 * apps/web/.env, using the configured ABACATEPAY_PRODUCT_ID. This is the step an earlier
 * version of this suite skipped — it POSTed straight to the webhook — which is exactly why a
 * misconfigured product id (one with no billing `cycle`, which /subscriptions/create rejects
 * outright) shipped while the tests were green. Anything that mocks the provider here gives
 * that bug a place to hide again.
 *
 * The test user is regenerated every run, and that is REQUIRED, not hygiene: AbacatePay's
 * subscription create is idempotent on `externalId` (our user id) and returns the previously
 * created bill WITHOUT validating the product it was sent. A fixed test user would therefore
 * keep answering 200 off their cache even with a completely broken ABACATEPAY_PRODUCT_ID. See
 * `newRun()` in support/fixtures.ts.
 *
 * WHAT IS SIMULATED, and why:
 *  - The OAuth handshake. Google blocks automated browsers, so global-setup mints the session
 *    row and signs the cookie the same way Better Auth does. Every check downstream of the
 *    handshake — signature verification, session lookup, `getViewerAccess` — runs for real.
 *  - Typing a card into AbacatePay's hosted page. That page is theirs, not ours, and there is
 *    no test card flow to drive. Instead the browser's navigation to it is stubbed and the
 *    `subscription.completed` callback is delivered to our webhook with a correct HMAC — for
 *    the REAL charge id the API just returned, not an invented one.
 *
 * SIDE EFFECT: each run creates a real dev-mode subscription record in the AbacatePay
 * dashboard. No money moves (the key is `abc_dev_…`), but they do accumulate.
 */

const IDEAS = "/ideas";

test.describe("purchase flow", () => {
  test("a signed-in viewer subscribes and unlocks the full database", async ({ page }) => {
    const run = readRun();

    // AbacatePay's hosted checkout is a third-party page with nothing for us to assert on.
    // Stub the browser's navigation to it — the server-side API call that produced this URL has
    // already happened and is what the test is really about.
    await page.route("https://app.abacatepay.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>AbacatePay hosted checkout (stubbed)</h1></body></html>",
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

    // ---- 2. Start checkout. THIS is the step that calls AbacatePay for real. -----------------
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
    // instead of a bare `expect(200)` — "Subscription checkout only accepts products with cycle
    // defined" tells you precisely what to fix; "expected 200, got 500" does not.
    expect(
      checkout.status,
      `POST /api/payments/checkout failed (body: ${checkout.body}). A 500 here usually means ` +
        `ABACATEPAY_PRODUCT_ID points at a product with no billing cycle (a one-off product), ` +
        `which /v2/subscriptions/create rejects — check the dev server log for AbacatePay's error.`,
    ).toBe(200);

    const body = JSON.parse(checkout.body) as {
      url?: string;
      alreadyActive?: boolean;
      pendingCheckout?: boolean;
    };
    // Guard the "succeeded but did nothing" shapes: both are 200s that would sail past a bare
    // status assertion while no subscription was ever created.
    expect(body.alreadyActive, "test user should not already have access").toBeFalsy();
    expect(body.pendingCheckout, "test user should not have an in-flight checkout").toBeFalsy();
    expect(body.url, "checkout should return a hosted-checkout URL").toMatch(
      /^https:\/\/app\.abacatepay\.com\/pay\/bill_/,
    );

    // The browser follows the URL; the stub above answers.
    await page.waitForURL(/app\.abacatepay\.com\/pay\/bill_/);

    const chargeId = new URL(body.url!).pathname.split("/").pop()!;
    expect(chargeId).toMatch(/^bill_/);

    // ---- 3. The checkout was recorded as pending, against our user. --------------------------
    const pending = await sql<{ status: string; user_id: string; amount_cents: string }>(
      `select status, user_id, amount_cents from purchases where provider_charge_id = $1`,
      [chargeId],
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]!.status).toBe("pending");
    expect(pending[0]!.user_id).toBe(run.userId);
    expect(Number(pending[0]!.amount_cents)).toBe(11000);

    // ---- 4. AbacatePay confirms the first payment. -------------------------------------------
    const subscriptionId = `e2e_sub_${chargeId}`;
    const hook = await postWebhook(
      subscriptionCompleted({ chargeId, subscriptionId, userId: run.userId }),
    );
    expect(hook.status, `webhook rejected: ${hook.body}`).toBe(200);

    const paid = await sql<{
      status: string;
      period_end: string | null;
      provider_subscription_id: string | null;
    }>(
      `select status, period_end, provider_subscription_id
         from purchases where provider_charge_id = $1`,
      [chargeId],
    );
    expect(paid[0]!.status).toBe("paid");
    // The subscription id is the only join key future renewals carry — losing it here would
    // silently break every renewal a year from now.
    expect(paid[0]!.provider_subscription_id).toBe(subscriptionId);
    // An annual subscription grants roughly a year; assert the shape, not an exact timestamp.
    const daysGranted =
      (new Date(paid[0]!.period_end!).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysGranted).toBeGreaterThan(360);
    expect(daysGranted).toBeLessThan(370);

    // ---- 5. The content is unlocked in the browser. ------------------------------------------
    // The paid view is paginated 20 per page; the seeded idea (demand 82) is expected on
    // page 1 of the near-empty e2e database.
    await page.goto(IDEAS);
    await expect(page.getByText(E2E.ideaTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(E2E.ideaOneLiner)).toBeVisible();
    // The paywall CTA is gone once access is granted.
    await expect(page.getByRole("button", { name: PAYWALL_CTA.ctaAuthenticated })).toHaveCount(0);
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
