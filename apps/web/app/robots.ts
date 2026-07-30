import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    // /login is deliberately absent: it carries `robots: { index: false }` in
    // its own metadata, and a crawler has to be allowed to fetch a page to see
    // that tag. Disallowing it here would leave it un-crawled but still
    // eligible to appear in results as a bare URL.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
