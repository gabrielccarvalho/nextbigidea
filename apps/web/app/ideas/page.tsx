import { listPublishedIdeas } from "@workspace/db";
import { getViewerAccess } from "@/lib/viewer-access";
import { IdeaCard } from "@/components/idea-card";
import { LockedTeaser } from "@/components/locked-teaser";
import { PaywallCta } from "@/components/paywall-cta";
import { toTeaserIdea } from "@/lib/teaser";

export default async function IdeasPage() {
  const [ideas, access] = await Promise.all([listPublishedIdeas(), getViewerAccess()]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">SaaS demand ideas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sourced from Reddit, Hacker News, Product Hunt and more. Updated weekly.
      </p>

      {!access.hasFullAccess && (
        <div className="my-6">
          <PaywallCta authenticated={access.userId != null} />
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {ideas.map((idea) =>
          access.hasFullAccess || idea.isFree ? (
            <IdeaCard key={idea.id} idea={idea} />
          ) : (
            // Only title + niche cross the wire for locked ideas. Do NOT pass
            // `idea` here — `toTeaserIdea()` is the only way to produce a
            // `TeaserIdea`, so a future edit widening this back to `idea={idea}`
            // is a compile error, not just a code-review catch.
            <LockedTeaser key={idea.id} idea={toTeaserIdea(idea)} />
          ),
        )}
      </div>
    </main>
  );
}
