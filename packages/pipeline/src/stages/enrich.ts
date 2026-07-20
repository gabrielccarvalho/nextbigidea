import { db, ideas, ideaEvidence } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { EnrichedIdea, RawPost } from "../types";
import type { HaikuClient } from "../anthropic";
import { slugify } from "./cluster";
import { parseEnrichedIdea } from "./idea";

export { parseEnrichedIdea } from "./idea";

export async function enrichTheme(
  themeTitle: string,
  posts: RawPost[],
  client: HaikuClient,
): Promise<EnrichedIdea | null> {
  const evidence = posts
    .map((p) => `- [${p.source}] ${(p.title ?? "").trim()} ${p.content.slice(0, 300)} (${JSON.stringify(p.metrics)})`)
    .join("\n");
  const prompt =
    `You are a SaaS analyst. Turn this cluster of demand posts about "${themeTitle}" into a structured idea.\n` +
    `Estimate a CONSERVATIVE potential MRR range in whole USD, derived from audience-size signals × a plausible price × a low conversion. Always treat it as an estimate.\n` +
    `Return ONLY JSON with keys: title, oneLiner, description, niche, keywords (space-separated), demandScore (0-100 integer), mrrLow (int USD), mrrHigh (int USD), competitionNotes, validationSignals (array of short strings).\n\n` +
    `Evidence:\n${evidence}`;
  return parseEnrichedIdea(await client.enrich(prompt));
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || "idea";
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.select({ id: ideas.id }).from(ideas).where(eq(ideas.slug, slug)).limit(1);
    if (existing.length === 0) return slug;
    slug = `${base}-${++i}`;
  }
}

// Persist a new draft idea, OR append evidence and bump ask_count on an existing one.
export async function persistIdea(
  idea: EnrichedIdea,
  posts: RawPost[],
  postIds: number[],
  matchedIdeaId: number | null,
): Promise<"created" | "updated"> {
  if (matchedIdeaId != null) {
    await db
      .update(ideas)
      .set({ askCount: sql`${ideas.askCount} + ${posts.length}` })
      .where(eq(ideas.id, matchedIdeaId));
    await linkEvidence(matchedIdeaId, postIds);
    return "updated";
  }
  const slug = await uniqueSlug(slugify(idea.title));
  const [row] = await db
    .insert(ideas)
    .values({
      slug,
      title: idea.title,
      oneLiner: idea.oneLiner,
      description: idea.description,
      niche: idea.niche,
      keywords: idea.keywords,
      demandScore: idea.demandScore,
      mrrLow: idea.mrrLow,
      mrrHigh: idea.mrrHigh,
      competitionNotes: idea.competitionNotes,
      validationSignals: idea.validationSignals,
      askCount: posts.length,
      status: "draft",
      isFree: false,
    })
    .returning({ id: ideas.id });
  await linkEvidence(row!.id, postIds);
  return "created";
}

async function linkEvidence(ideaId: number, postIds: number[]): Promise<void> {
  if (postIds.length === 0) return;
  await db
    .insert(ideaEvidence)
    .values(postIds.map((rawPostId) => ({ ideaId, rawPostId, role: "demand" })))
    .onConflictDoNothing();
}
