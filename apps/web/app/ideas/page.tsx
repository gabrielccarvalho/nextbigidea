import { listPublishedIdeas } from "@workspace/db";
import { getViewerAccess } from "@/lib/viewer-access";
import { IdeaCard } from "@/components/idea-card";
import { LockedBlocker } from "@/components/locked-blocker";
import { Pagination } from "@/components/pagination";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { clampPage, IDEAS_PER_PAGE } from "@/lib/pagination";
import { IDEAS_PAGE } from "@/lib/content";

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
        <main className="mx-auto max-w-4xl px-4 py-10">
          <h1 className="text-2xl font-bold">{IDEAS_PAGE.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{IDEAS_PAGE.subhead}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold">{IDEAS_PAGE.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{IDEAS_PAGE.subhead}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
