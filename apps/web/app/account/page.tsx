import Link from "next/link";
import { getViewerAccess } from "@/lib/viewer-access";
import { AuthButtons } from "@/components/auth-buttons";
import { PaywallCta } from "@/components/paywall-cta";
import { CancelSubscription } from "@/components/cancel-subscription";

export default async function AccountPage() {
  const access = await getViewerAccess();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Your account</h1>

      {!access.userId ? (
        <div className="mt-6">
          <p className="text-muted-foreground">Sign in to manage your access.</p>
          <div className="mt-4">
            <AuthButtons />
          </div>
        </div>
      ) : access.hasFullAccess && !access.cancelledAt ? (
        <div className="mt-6 rounded-lg border bg-muted/30 p-6">
          <p className="font-medium">Subscription active</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can see every idea. Your access runs through{" "}
            {access.periodEnd?.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
            .
          </p>
          <Link href="/ideas" className="mt-4 inline-block underline">
            Go to the ideas &rarr;
          </Link>
          <CancelSubscription />
        </div>
      ) : access.hasFullAccess ? (
        <div className="mt-6 rounded-lg border bg-muted/30 p-6">
          <p className="font-medium">
            Access ends{" "}
            {access.periodEnd?.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
            . Your subscription will not renew.
          </p>
          <Link href="/ideas" className="mt-4 inline-block underline">
            Go to the ideas &rarr;
          </Link>
          <div className="mt-4">
            <PaywallCta authenticated />
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-muted-foreground">You&apos;re on the free plan (5 ideas).</p>
          <div className="mt-4">
            <PaywallCta authenticated />
          </div>
        </div>
      )}
    </main>
  );
}
