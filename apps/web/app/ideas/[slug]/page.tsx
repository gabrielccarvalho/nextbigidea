import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublishedIdeaBySlug, getEvidenceForIdea } from "@workspace/db";
import { getViewerAccess } from "@/lib/viewer-access";
import { PaywallCta } from "@/components/paywall-cta";
import { toTeaserIdea } from "@/lib/teaser";

export default async function IdeaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const idea = await getPublishedIdeaBySlug(slug);
  if (!idea) notFound();

  const access = await getViewerAccess();
  const locked = !access.hasFullAccess && !idea.isFree;

  if (locked) {
    // Server-side gate: `toTeaserIdea()` is the only way to produce a
    // `TeaserIdea`, and it only reads `title` + `niche` off `idea`. Nothing
    // else from `idea` is referenced in this branch, and
    // `getEvidenceForIdea` is never called here — the description, MRR,
    // demand score, ask count, competition notes, validation signals, and
    // evidence posts never leave the server for a locked view.
    const teaser = toTeaserIdea(idea);
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/ideas" className="text-sm text-muted-foreground">
          ← All ideas
        </Link>
        <div className="mb-1 mt-4 text-xs uppercase text-muted-foreground">{teaser.niche}</div>
        <h1 className="text-2xl font-bold">{teaser.title}</h1>
        <p className="mt-2 text-muted-foreground">
          This idea is locked. Unlock the full database to see the demand evidence, sources,
          MRR estimate, and validation signals.
        </p>
        <div className="mt-6">
          <PaywallCta authenticated={access.userId != null} />
        </div>
      </main>
    );
  }

  const evidence = await getEvidenceForIdea(idea.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/ideas" className="text-sm text-muted-foreground">
        ← All ideas
      </Link>
      <div className="mb-1 mt-4 text-xs uppercase text-muted-foreground">{idea.niche}</div>
      <h1 className="text-2xl font-bold">{idea.title}</h1>
      <p className="mt-1 text-lg text-muted-foreground">{idea.oneLiner}</p>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <span>Demand: {idea.demandScore}/100</span>
        <span>Asks: {idea.askCount}</span>
        <span>
          Est. MRR: ${idea.mrrLow}–${idea.mrrHigh}/mo
        </span>
      </div>

      <section className="mt-6">
        <h2 className="font-semibold">The opportunity</h2>
        <p className="mt-1 whitespace-pre-line text-sm">{idea.description}</p>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">MRR estimate</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ${idea.mrrLow}–${idea.mrrHigh}/mo is a conservative, directional range — not a
          forecast. It is derived from audience-size signals in the source posts, a plausible
          price point for this niche, and a low assumed conversion rate. Treat it as a heuristic
          for prioritizing ideas, not a prediction of actual revenue.
        </p>
      </section>

      {idea.competitionNotes && (
        <section className="mt-6">
          <h2 className="font-semibold">Competition</h2>
          <p className="mt-1 text-sm">{idea.competitionNotes}</p>
        </section>
      )}

      {idea.validationSignals.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Validation signals</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {idea.validationSignals.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-semibold">Sources ({evidence.length})</h2>
        <ul className="mt-2 space-y-2">
          {evidence.map((p) => (
            <li key={p.id} className="text-sm">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline">
                [{p.source}] {p.title ?? p.content.slice(0, 80)}
              </a>
              {p.postedAt && (
                <span className="ml-2 text-muted-foreground">
                  {p.postedAt.toISOString().slice(0, 10)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
