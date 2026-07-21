/**
 * Reconciles `pending` purchases against AbacatePay, for LOCAL DEVELOPMENT.
 *
 * Why this exists: AbacatePay delivers payment confirmation by webhook, and it cannot reach
 * `localhost`. So a purchase completed against a dev server succeeds at the provider, the
 * customer is redirected to `/account?purchase=success`, and the app never finds out — the
 * `purchases` row sits at `pending` forever and the account still shows the paywall.
 *
 * What it does NOT do: invent access. For each pending row it asks AbacatePay whether that
 * charge was actually paid (`GET /v2/checkouts/get`), and only then replays a correctly-signed
 * `subscription.completed` webhook at the local server. The real webhook route does all the
 * work — the same transaction, period arithmetic, idempotency and subscription-id capture a
 * production callback would get. Nothing here writes to the database directly.
 *
 * Usage:
 *   pnpm --filter web payments:reconcile
 *   pnpm --filter web payments:reconcile -- --target http://localhost:3100
 *   pnpm --filter web payments:reconcile -- --dry-run
 */
import { createHmac } from "node:crypto";
// Shared with the E2E suite: same .env, same local Neon proxy, same failure messages.
import { loadEnv, required } from "../e2e/support/env";
import { sql } from "../e2e/support/sql";
import { ABACATEPAY_HMAC_PUBLIC_KEY } from "../lib/payments/abacatepay";

const API = "https://api.abacatepay.com/v2";

type PendingRow = {
  provider_charge_id: string;
  user_id: string;
  created_at: string;
};

type AbacateCheckout = {
  id: string;
  externalId: string | null;
  status: string;
  amount: number;
  paidAmount: number | null;
};

type AbacateSubscription = { id: string; status: string; createdAt: string };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const BRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

async function abacate<T>(path: string): Promise<{ data: T | null; error: unknown }> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${required("ABACATEPAY_API_KEY")}` },
  });
  const json = (await res.json()) as { data?: T; error?: unknown };
  return { data: json.data ?? null, error: res.ok ? (json.error ?? null) : (json.error ?? res.statusText) };
}

/** Signs and delivers a webhook exactly as AbacatePay would. */
async function deliver(target: string, event: unknown): Promise<{ status: number; body: string }> {
  const rawBody = JSON.stringify(event);
  const signature = createHmac("sha256", ABACATEPAY_HMAC_PUBLIC_KEY)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("base64");
  const url = `${target}/api/payments/webhook?webhookSecret=${encodeURIComponent(
    required("ABACATEPAY_WEBHOOK_SECRET"),
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-signature": signature },
    body: rawBody,
  });
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}

async function main() {
  loadEnv();

  const target = (arg("target") ?? "http://localhost:3000").replace(/\/$/, "");
  const dryRun = process.argv.includes("--dry-run");

  // This tool replays payment webhooks. Pointing it at a deployed environment would be a way to
  // fire money-path events at production by hand, so it refuses anything but a local target.
  const host = new URL(target).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error(
      `Refusing to target ${target}. This script is a local-development aid — production ` +
        `receives real webhooks from AbacatePay and must never be driven by hand.`,
    );
    process.exit(1);
  }

  const pending = await sql<PendingRow>(
    `select provider_charge_id, user_id, created_at
       from purchases
      where status = 'pending'
      order by created_at asc`,
  );

  if (pending.length === 0) {
    console.log("No pending purchases. Nothing to reconcile.");
    return;
  }

  console.log(
    `${pending.length} pending purchase${pending.length === 1 ? "" : "s"} → ${target}` +
      (dryRun ? "  (dry run)" : ""),
  );

  let reconciled = 0;
  let skipped = 0;

  for (const row of pending) {
    const charge = row.provider_charge_id;
    console.log(`\n  ${charge}  user ${row.user_id}`);

    // 1. Ground truth: did the provider actually take the money for this charge?
    const { data: checkout, error } = await abacate<AbacateCheckout>(
      `/checkouts/get?id=${encodeURIComponent(charge)}`,
    );
    if (!checkout) {
      console.log(`    provider status : UNKNOWN — ${JSON.stringify(error)}`);
      console.log(`    → skipped`);
      skipped += 1;
      continue;
    }
    console.log(
      `    provider status : ${checkout.status}` +
        (checkout.paidAmount ? ` (${BRL(checkout.paidAmount)})` : ""),
    );
    if (checkout.status !== "PAID") {
      console.log(`    → skipped (not paid; access must not be granted)`);
      skipped += 1;
      continue;
    }

    // 2. The subscription id. Renewals carry `externalId: null` and can ONLY be resolved through
    //    this id, so a paid row without it silently breaks billing a year from now.
    const externalId = checkout.externalId ?? row.user_id;
    const { data: subs } = await abacate<AbacateSubscription[]>(
      `/subscriptions/list?externalId=${encodeURIComponent(externalId)}`,
    );
    const subscription =
      subs?.find((s) => s.status === "ACTIVE") ??
      [...(subs ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    let event: unknown;
    if (subscription) {
      console.log(`    subscription    : ${subscription.id} (${subscription.status})`);
      event = {
        id: `evt_reconcile_${charge}`,
        event: "subscription.completed",
        apiVersion: "v2",
        devMode: true,
        data: {
          checkout: { id: charge, externalId },
          subscription: { id: subscription.id },
        },
      };
    } else {
      // Grant access rather than withhold it — the money was taken — but say plainly what is
      // missing, because renewals will not resolve without a subscription id.
      console.log(
        `    subscription    : NONE FOUND for externalId ${externalId}\n` +
          `                      granting access via checkout.completed; renewals for this row ` +
          `will NOT resolve`,
      );
      event = {
        id: `evt_reconcile_${charge}`,
        event: "checkout.completed",
        apiVersion: "v2",
        devMode: true,
        data: { checkout: { id: charge, externalId } },
      };
    }

    if (dryRun) {
      console.log(`    → would deliver ${(event as { event: string }).event}`);
      reconciled += 1;
      continue;
    }

    const res = await deliver(target, event);
    console.log(`    → POST /api/payments/webhook  ${res.status} ${res.body}`);
    if (res.status === 200) {
      reconciled += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(`\n${reconciled} reconciled, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
