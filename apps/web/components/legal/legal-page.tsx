import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { COMPANY } from "@/lib/content";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pb-8 pt-16">
        <Link
          href="/"
          className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          &larr; Back to {COMPANY.name}
        </Link>

        <div className="mt-8 border-b border-border pb-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 text-muted-foreground">{intro}</p>
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            Last updated {COMPANY.lastUpdated}
          </p>
        </div>

        <div
          className="text-[0.95rem] leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-medium [&_h3]:text-foreground [&_li]:my-1.5 [&_p]:my-3 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:ps-5"
        >
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
