import type { MetadataRoute } from "next";
import { listPublishedIdeas } from "@workspace/db";
import { SITE_URL } from "@/lib/site-url";

// Ideas are published from the admin panel, not at deploy time, so a sitemap
// baked at build would go stale the moment one ships. Hourly is far more often
// than the catalog changes and costs one query an hour.
export const revalidate = 3600;

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
  { url: `${SITE_URL}/ideas`, changeFrequency: "weekly", priority: 0.8 },
  { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let ideaRoutes: MetadataRoute.Sitemap = [];

  try {
    const ideas = await listPublishedIdeas();

    // FREE ideas only. A slug is derived from the title, so listing every
    // published idea here would republish the whole paid catalog's titles in a
    // file built for machines to read in bulk — the exact enumeration that
    // /ideas and toTeaserIdea() go out of their way to prevent. Free samples
    // are already fully public on /ideas, so they lose nothing by being here.
    // The matching `robots: { index: false }` on paid idea pages lives in
    // app/ideas/[slug]/page.tsx; the two need to agree.
    ideaRoutes = ideas
      .filter((idea) => idea.isFree)
      .map((idea) => ({
        url: `${SITE_URL}/ideas/${idea.slug}`,
        lastModified: idea.publishedAt ?? idea.createdAt,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      }));
  } catch {
    // A sitemap missing its idea URLs is a bad day for SEO; a build or request
    // that 500s because the database blinked is a bad day for everyone. Serve
    // the static routes and let the next revalidation pick the ideas back up.
  }

  return [...STATIC_ROUTES, ...ideaRoutes];
}
