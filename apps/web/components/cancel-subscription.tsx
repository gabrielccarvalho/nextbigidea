"use client";
import { useState } from "react";

type Status = "idle" | "confirming" | "loading" | "error";

// Deliberately NOT window.confirm — that's a blocking browser dialog. This is a two-click
// in-component confirm instead: first click reveals the warning inline, second click sends
// the request.
export function CancelSubscription() {
  const [status, setStatus] = useState<Status>("idle");

  async function confirmCancel() {
    setStatus("loading");
    const res = await fetch("/api/payments/cancel", { method: "POST" });
    if (!res.ok) {
      setStatus("error");
      return;
    }
    window.location.reload();
  }

  if (status === "idle") {
    return (
      <button
        onClick={() => setStatus("confirming")}
        className="mt-4 text-sm text-muted-foreground underline underline-offset-2"
      >
        Cancel subscription
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p>
        Cancelling takes effect immediately and cannot be undone. No refund is issued for the
        time already paid — you keep full access until your current period ends.
      </p>
      {status === "error" ? (
        <p className="mt-2 font-medium text-destructive">
          Something went wrong cancelling your subscription. Please try again.
        </p>
      ) : null}
      <div className="mt-3 flex gap-3">
        <button
          onClick={confirmCancel}
          disabled={status === "loading"}
          className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === "loading" ? "Cancelling…" : "Yes, cancel my subscription"}
        </button>
        <button
          onClick={() => setStatus("idle")}
          disabled={status === "loading"}
          className="rounded-md px-4 py-2 text-sm underline underline-offset-2 disabled:opacity-50"
        >
          Never mind
        </button>
      </div>
    </div>
  );
}
