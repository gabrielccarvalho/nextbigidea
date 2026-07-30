import { COMPANY, METADATA } from "@/lib/content";
import { SITE_URL } from "@/lib/site-url";

// Organization + WebSite on the homepage only. These are the two schemas that
// actually earn something for a site this size — they tell Google which name,
// logo, and URL belong together, which is what a knowledge panel and sitelinks
// are built from. Deliberately NOT emitting Product/Offer (Google's product
// rich results expect retail semantics and flag data products) or FAQPage
// (deprecated for rich results on sites like this since 2023).
//
// `@id` cross-links the two nodes so they're read as one entity rather than
// two unrelated things that happen to share a name.
const ORGANIZATION_ID = `${SITE_URL}/#organization`;

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: COMPANY.name,
      legalName: COMPANY.legalName,
      url: SITE_URL,
      email: COMPANY.email,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon.png`,
        width: 512,
        height: 512,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: COMPANY.name,
      url: SITE_URL,
      description: METADATA.description,
      publisher: { "@id": ORGANIZATION_ID },
      inLanguage: "en-US",
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // Every value above is a build-time constant from lib/content.ts and
      // lib/site-url.ts — no user or database input reaches this string, so
      // there is nothing here that could close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
