"use client";
import { useState } from "react";
import { PAYWALL_CTA, PRICING } from "@/lib/content";

export function PaywallCta({
  authenticated,
  variant = "standalone",
}: {
  authenticated: boolean;
  variant?: "standalone" | "embedded";
}) {
  const [loading, setLoading] = useState(false);

  async function buy() {
    setLoading(true);
    const res = await fetch("/api/payments/checkout", { method: "POST" });
    if (!res.ok) {
      setLoading(false);
      window.location.href = "/account";
      return;
    }
    // The route answers 200 with `{ alreadyActive: true }` when a subscription is already
    // running, or `{ pendingCheckout: true }` when one was started recently and is still in
    // flight. Reading `url` off either shape used to navigate to `undefined` — both fall
    // through to the same "go to /account" branch below instead.
    const body = (await res.json()) as {
      url?: string;
      alreadyActive?: boolean;
      pendingCheckout?: boolean;
    };
    if (body.url) {
      window.location.href = body.url;
      return;
    }
    setLoading(false);
    window.location.href = "/account";
  }

  // "embedded" is used when this CTA sits inside a card that already states the
  // price and renewal terms (e.g. the pricing section) — rendering the heading
  // and subtext again there would duplicate that disclosure. "standalone" (the
  // default) keeps the full self-contained appearance used on /ideas,
  // /ideas/[slug], and /account.
  return (
    <div className="rounded-lg border bg-muted/30 p-6 text-center">
      {variant === "standalone" && (
        <>
          <h2 className="text-lg font-semibold">
            {PAYWALL_CTA.headlinePrefix} — {PRICING.amountBRL}/{PRICING.term}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{PAYWALL_CTA.subtext}</p>
        </>
      )}
      <button
        onClick={buy}
        disabled={loading}
        className="mt-4 rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {loading ? "Redirecting…" : authenticated ? PAYWALL_CTA.ctaAuthenticated : PAYWALL_CTA.ctaSignedOut}
      </button>
    </div>
  );
}
