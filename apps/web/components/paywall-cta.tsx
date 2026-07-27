"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAYWALL_CTA, PRICING } from "@/lib/content";

type Status = "idle" | "loading" | "pending" | "error";

export function PaywallCta({
  authenticated,
  variant = "standalone",
}: {
  authenticated: boolean;
  variant?: "standalone" | "embedded";
}) {
  const [status, setStatus] = useState<Status>("idle");
  const pathname = usePathname();

  async function buy() {
    setStatus("loading");
    let res: Response;
    try {
      res = await fetch("/api/payments/checkout", { method: "POST" });
    } catch {
      setStatus("error");
      return;
    }
    if (!res.ok) {
      setStatus("error");
      return;
    }
    // The route answers 200 with `{ alreadyActive: true }` when this user has
    // already paid (reload — the server will re-render everything unlocked), or
    // `{ pendingCheckout: true }` when they finished paying at Stripe but the
    // confirming webhook hasn't landed yet. Neither carries a `url`, so each gets
    // its own branch instead of navigating to `undefined`.
    //
    // A `url` may be a NEW Checkout Session or the one they already had open —
    // the route resumes an in-flight session rather than minting a second one, so
    // there is nothing to distinguish here.
    const body = (await res.json()) as {
      url?: string;
      alreadyActive?: boolean;
      pendingCheckout?: boolean;
    };
    if (body.url) {
      window.location.href = body.url;
      return;
    }
    if (body.alreadyActive) {
      window.location.reload();
      return;
    }
    setStatus(body.pendingCheckout ? "pending" : "error");
  }

  // "embedded" is used when this CTA sits inside a card that already states the
  // price and payment terms (e.g. the pricing section) — rendering the heading
  // and subtext again there would duplicate that disclosure. "standalone" (the
  // default) keeps the full self-contained appearance used on /ideas and
  // /ideas/[slug].
  return (
    <div className="rounded-lg border bg-muted/30 p-6 text-center">
      {variant === "standalone" && (
        <>
          <h2 className="text-lg font-semibold">
            {PAYWALL_CTA.headlinePrefix} — {PRICING.amount}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{PAYWALL_CTA.subtext}</p>
        </>
      )}
      {authenticated ? (
        <button
          onClick={buy}
          disabled={status === "loading"}
          className="mt-4 rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {status === "loading" ? "Redirecting…" : PAYWALL_CTA.ctaAuthenticated}
        </button>
      ) : (
        // Signed out: go sign in first, then return to this exact page to complete checkout.
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="mt-4 inline-block rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background"
        >
          {PAYWALL_CTA.ctaSignedOut}
        </Link>
      )}
      {status === "pending" && (
        <p className="mt-3 text-sm text-muted-foreground">{PAYWALL_CTA.pendingMessage}</p>
      )}
      {status === "error" && (
        <p className="mt-3 text-sm font-medium text-destructive">{PAYWALL_CTA.errorMessage}</p>
      )}
    </div>
  );
}
