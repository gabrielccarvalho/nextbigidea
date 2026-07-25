import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublishedIdeaBySlug, getEvidenceForIdea } from "@workspace/db";
import { getViewerAccess } from "@/lib/viewer-access";
import { PaywallCta } from "@/components/paywall-cta";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { toTeaserIdea } from "@/lib/teaser";
import { IDEA_DETAIL, IDEA_LABELS } from "@/lib/content";
import { formatMoneyRange, sourceDisplay } from "@/lib/format";

// The specimen card's micro-heading treatment, reused for every section so the
// page scans as one system: label in mono smallcaps, content below.
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </h2>
  );
}

// dt precedes dd in the DOM (dl semantics); flex-col-reverse puts the value on
// top visually, same as the specimen's stat row.
function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-1 bg-background px-5 py-4">
      <dt className="font-mono text-[0.55rem] uppercase tracking-[0.17em] text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-2xl font-bold leading-none tracking-tight tabular-nums">
        {children}
      </dd>
    </div>
  );
}

function IdeaHeader({
  niche,
  title,
  oneLiner,
}: {
  niche: string;
  title: string;
  oneLiner?: string;
}) {
  return (
    <>
      <Link
        href="/ideas"
        className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← All ideas
      </Link>
      <div className="mt-6 flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-chart-1">
        <span aria-hidden className="h-px w-6 shrink-0 bg-chart-1/60" />
        {/* Model-written niches can run long; keep the eyebrow to one line. */}
        <span className="min-w-0 truncate">{niche}</span>
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {oneLiner && (
        <p className="mt-3 max-w-xl text-lg leading-relaxed text-muted-foreground">{oneLiner}</p>
      )}
    </>
  );
}

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
    // evidence posts never leave the server for a locked view. The panel
    // below is a decorative skeleton: fixed bars, no data.
    const teaser = toTeaserIdea(idea);
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <IdeaHeader niche={teaser.niche} title={teaser.title} />

          <section className="relative mt-8">
            <div aria-hidden className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                {["w-10", "w-8", "w-14", "w-8"].map((w, i) => (
                  <div key={i} className="bg-background px-5 py-4">
                    <div className={`h-6 ${w} rounded bg-chart-1/20 blur-[3px]`} />
                    <div className="mt-2 h-2 w-12 rounded bg-foreground/10 blur-[2px]" />
                  </div>
                ))}
              </div>
              <div className="space-y-2.5 border-t border-border p-5">
                {[
                  "w-full",
                  "w-11/12",
                  "w-full",
                  "w-4/5",
                  "w-full",
                  "w-2/3",
                  "w-full",
                  "w-5/6",
                  "w-1/2",
                ].map((w, i) => (
                  <div key={i} className={`h-3 ${w} rounded bg-foreground/10 blur-[2px]`} />
                ))}
              </div>
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-background/40 via-background/85 to-background px-6 text-center">
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                {IDEA_DETAIL.lockedMessage}
              </p>
              <div className="w-full max-w-md">
                <PaywallCta authenticated={access.userId != null} />
              </div>
            </div>
          </section>
        </main>
        <SiteFooter />
      </>
    );
  }

  const evidence = await getEvidenceForIdea(idea.id);
  const mrr = formatMoneyRange(idea.mrrLow, idea.mrrHigh);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <IdeaHeader niche={idea.niche} title={idea.title} oneLiner={idea.oneLiner} />

        {/* The receipts, above the fold: score, asks, revenue range, source
            count — with the MRR caveat attached to the number it qualifies. */}
        <section className="mt-8 overflow-hidden rounded-xl border">
          <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            <div className="flex flex-col-reverse gap-1 bg-background px-5 py-4">
              <dt className="font-mono text-[0.55rem] uppercase tracking-[0.17em] text-muted-foreground">
                {IDEA_LABELS.score}
              </dt>
              <dd>
                <div className="font-mono text-2xl font-bold leading-none tracking-tight text-chart-1 tabular-nums">
                  {idea.demandScore}
                </div>
                <div className="mt-2 h-0.5 w-16 overflow-hidden rounded-full bg-border">
                  <div className="h-full bg-chart-1" style={{ width: `${idea.demandScore}%` }} />
                </div>
              </dd>
            </div>
            <StatCell label={IDEA_LABELS.asks}>{idea.askCount}</StatCell>
            <StatCell label={IDEA_LABELS.mrr}>{mrr}</StatCell>
            <StatCell label={IDEA_LABELS.sources}>{evidence.length}</StatCell>
          </dl>
          <p className="border-t border-border px-5 py-3.5 text-xs leading-relaxed text-muted-foreground">
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.17em]">
              {IDEA_DETAIL.mrrHeading}:
            </span>{" "}
            {mrr}/mo {IDEA_DETAIL.mrrBody}
          </p>
        </section>

        <section className="mt-10">
          <SectionHeading>{IDEA_DETAIL.opportunityHeading}</SectionHeading>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground/90">
            {idea.description}
          </p>
        </section>

        {idea.validationSignals.length > 0 && (
          <section className="mt-10">
            <SectionHeading>{IDEA_DETAIL.validationHeading}</SectionHeading>
            <ul className="mt-2">
              {idea.validationSignals.map((v, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-3 border-b border-border/50 py-2.5 text-sm leading-relaxed text-foreground/90 last:border-b-0"
                >
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-chart-1" />
                  {v}
                </li>
              ))}
            </ul>
          </section>
        )}

        {idea.competitionNotes && (
          <section className="mt-10">
            <SectionHeading>{IDEA_DETAIL.competitionHeading}</SectionHeading>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {idea.competitionNotes}
            </p>
          </section>
        )}

        <section className="mt-10">
          <SectionHeading>
            {IDEA_DETAIL.sourcesHeading} ({evidence.length})
          </SectionHeading>
          <ul className="mt-2">
            {evidence.map((p) => {
              const src = sourceDisplay(p.source);
              return (
                <li
                  key={p.id}
                  className="flex items-baseline gap-3 border-b border-border/50 py-2.5 last:border-b-0"
                >
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: src.color ?? "var(--color-muted-foreground)" }}
                  />
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 text-sm leading-relaxed underline-offset-4 hover:underline"
                  >
                    {p.title ?? p.content.slice(0, 80)}
                  </a>
                  <span className="shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground">
                    {src.name}
                  </span>
                  {p.postedAt && (
                    <span className="hidden shrink-0 font-mono text-[0.55rem] tracking-[0.08em] text-muted-foreground/70 tabular-nums sm:inline">
                      {p.postedAt.toISOString().slice(0, 10)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
