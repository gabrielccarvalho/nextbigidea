"use client";
import { useState } from "react";

export function PaywallCta({ authenticated }: { authenticated: boolean }) {
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
    // running. Reading `url` off that shape used to navigate to `undefined`.
    const body = (await res.json()) as { url?: string; alreadyActive?: boolean };
    if (body.url) {
      window.location.href = body.url;
      return;
    }
    setLoading(false);
    window.location.href = "/account";
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-6 text-center">
      <h2 className="text-lg font-semibold">Unlock every idea — R$110/year</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Card payment, renews yearly. Cancel any time.
      </p>
      <button
        onClick={buy}
        disabled={loading}
        className="mt-4 rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {loading ? "Redirecting…" : authenticated ? "Subscribe now" : "Sign in to subscribe"}
      </button>
    </div>
  );
}
