import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewerAccess } from "@/lib/viewer-access";
import { PaywallCta } from "@/components/paywall-cta";
import { CancelSubscription } from "@/components/cancel-subscription";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ACCOUNT_PAGE } from "@/lib/content";

export default async function AccountPage() {
  const access = await getViewerAccess();

  // Signed-out visitors have no account to manage — send them to sign in, then back here.
  if (!access.userId) redirect("/login?next=/account");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold">{ACCOUNT_PAGE.title}</h1>

        {access.hasFullAccess && !access.cancelledAt ? (
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
              {ACCOUNT_PAGE.ideasLinkLabel} &rarr;
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
            <p className="text-muted-foreground">{ACCOUNT_PAGE.freePlanMessage}</p>
            <div className="mt-4">
              <PaywallCta authenticated />
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
