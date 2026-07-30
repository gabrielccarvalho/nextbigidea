import type { Metadata } from "next";
import { listPublishedIdeas } from "@workspace/db";
import { getViewerAccess } from "@/lib/viewer-access";
import { IdeaCard } from "@/components/idea-card";
import { LockedBlocker } from "@/components/locked-blocker";
import { Pagination } from "@/components/pagination";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { clampPage, IDEAS_PER_PAGE } from "@/lib/pagination";
import { IDEAS_PAGE } from "@/lib/content";

export const metadata: Metadata = {
  title: IDEAS_PAGE.title,
  description: IDEAS_PAGE.subhead,
  // Paginated views (`?page=2`) point back at the bare /ideas URL. The paid
  // listing is only ever paginated for signed-in buyers, so there is no
  // crawlable page 2 to rank on its own.
  alternates: { canonical: "/ideas" },
  openGraph: {
    type: "website",
    url: "/ideas",
    title: IDEAS_PAGE.title,
    description: IDEAS_PAGE.subhead,
  },
  twitter: {
    card: "summary_large_image",
    title: IDEAS_PAGE.title,
    description: IDEAS_PAGE.subhead,
  },
};

// Shared by both branches so the free and paid views can't drift. The total
// published count is safe to show unpaid viewers — they already see the free
// cards plus the locked count, which sum to it.
function PageHeader({ total }: { total: number }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div>
        <span className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-chart-1">
          <span aria-hidden className="h-px w-6 bg-chart-1/60" />
          {IDEAS_PAGE.eyebrow}
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{IDEAS_PAGE.title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {IDEAS_PAGE.subhead}
        </p>
      </div>
      <div className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="text-foreground tabular-nums">{total}</span> {IDEAS_PAGE.countSuffix}
      </div>
    </header>
  );
}

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ page: rawPage }, ideas, access] = await Promise.all([
    searchParams,
    listPublishedIdeas(),
    getViewerAccess(),
  ]);

  // Unpaid viewers get the free ideas in full and NOTHING about the rest —
  // no titles, no niches, only a count. The locked list used to render one
  // teaser per idea; that leaked every title to anyone who scrolled.
  if (!access.hasFullAccess) {
    const freeIdeas = ideas.filter((idea) => idea.isFree);
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-6 py-12">
          <PageHeader total={ideas.length} />

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {freeIdeas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>

          <LockedBlocker
            lockedCount={ideas.length - freeIdeas.length}
            authenticated={access.userId != null}
          />
        </main>
        <SiteFooter />
      </>
    );
  }

  // Paid viewers: the entire database, 20 per page, page number in the URL so
  // any page can be shared or reloaded. Ordering comes from
  // orderIdeasForListing (free first, then demand, then recency), which lives
  // in JS — so pagination slices the ordered list rather than using SQL
  // LIMIT/OFFSET against a different order.
  const totalPages = Math.max(1, Math.ceil(ideas.length / IDEAS_PER_PAGE));
  const page = clampPage(rawPage, totalPages);
  const pageIdeas = ideas.slice((page - 1) * IDEAS_PER_PAGE, page * IDEAS_PER_PAGE);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <PageHeader total={ideas.length} />

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {pageIdeas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>

        <Pagination page={page} totalPages={totalPages} basePath="/ideas" />
      </main>
      <SiteFooter />
    </>
  );
}
