import { db, ideas, ideaEvidence } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { EnrichedIdea, RawPost } from "../types";
import type { LlmClient } from "../llm";
import { slugify } from "./cluster";
import { parseEnrichedIdea } from "./idea";

export { parseEnrichedIdea } from "./idea";

// Mirrors the EnrichedIdea interface in types.ts. `strict` mode requires every property
// to appear in `required`, so optionality is expressed by the parser's guards
// (parseEnrichedIdea already defaults the non-essential fields), not by the schema.
const IDEA_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    oneLiner: { type: "string" },
    description: { type: "string" },
    niche: { type: "string" },
    keywords: { type: "string", description: "space-separated" },
    demandScore: { type: "integer", description: "0-100" },
    mrrLow: { type: "integer", description: "whole USD" },
    mrrHigh: { type: "integer", description: "whole USD" },
    competitionNotes: { type: "string" },
    validationSignals: { type: "array", items: { type: "string" } },
  },
  required: [
    "title",
    "oneLiner",
    "description",
    "niche",
    "keywords",
    "demandScore",
    "mrrLow",
    "mrrHigh",
    "competitionNotes",
    "validationSignals",
  ],
  additionalProperties: false,
} as const satisfies Record<string, unknown>;

export async function enrichTheme(
  themeTitle: string,
  posts: RawPost[],
  client: LlmClient,
): Promise<EnrichedIdea | null> {
  const evidence = posts
    .map((p) => `- [${p.source}] ${(p.title ?? "").trim()} ${p.content.slice(0, 300)} (${JSON.stringify(p.metrics)})`)
    .join("\n");
  const prompt =
    `You are a SaaS analyst. Turn this cluster of demand posts about "${themeTitle}" into a structured idea.\n` +
    `Estimate a CONSERVATIVE potential MRR range in whole USD, derived from audience-size signals × a plausible price × a low conversion. Always treat it as an estimate.\n` +
    `validationSignals are short strings. demandScore is 0-100.\n\n` +
    `Evidence:\n${evidence}`;
  // The quality tier: this JSON is what a subscriber reads.
  return parseEnrichedIdea(await client.complete(prompt, { tier: "quality", schema: IDEA_SCHEMA }));
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
