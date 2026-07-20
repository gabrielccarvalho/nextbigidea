import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { ideas, ideaEvidence, rawPosts } from "./schema";
import type { Idea, RawPost } from "./index";
import { orderIdeasForListing } from "./ordering";

export { orderIdeasForListing } from "./ordering";

export async function listPublishedIdeas(): Promise<Idea[]> {
  const rows = await db.select().from(ideas).where(eq(ideas.status, "published"));
  return orderIdeasForListing(rows);
}

export async function getPublishedIdeaBySlug(slug: string): Promise<Idea | undefined> {
  const rows = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.slug, slug), eq(ideas.status, "published")))
    .limit(1);
  return rows[0];
}

export async function getEvidenceForIdea(ideaId: number): Promise<RawPost[]> {
  const links = await db
    .select({ rawPostId: ideaEvidence.rawPostId })
    .from(ideaEvidence)
    .where(eq(ideaEvidence.ideaId, ideaId));
  if (links.length === 0) return [];
  return db
    .select()
    .from(rawPosts)
    .where(inArray(rawPosts.id, links.map((l) => l.rawPostId)))
    .orderBy(desc(rawPosts.postedAt));
}
