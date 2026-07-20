"use client";
import { useState } from "react";

export function PaywallCta({ authenticated }: { authenticated: boolean }) {
  const [loading, setLoading] = useState(false);

  async function buy() {
    setLoading(true);
    const res = await fetch("/api/payments/checkout", { method: "POST" });
    if (res.ok) {
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } else {
      setLoading(false);
      window.location.href = "/account";
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-6 text-center">
      <h2 className="text-lg font-semibold">Unlock every idea — R$110 lifetime</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        One card payment. All current and future ideas, forever.
      </p>
      <button
        onClick={buy}
        disabled={loading}
        className="mt-4 rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {loading ? "Redirecting…" : authenticated ? "Unlock now" : "Sign in to unlock"}
      </button>
    </div>
  );
}
