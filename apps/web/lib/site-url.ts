// The canonical origin for every absolute URL the app emits: the `metadataBase`
// that resolves OG image paths, sitemap entries, and robots.txt's sitemap
// pointer. It lived as a copy-pasted `process.env.NEXT_PUBLIC_APP_URL ?? ...`
// in three files; one place means the three can't drift apart, which matters
// because a wrong value here is invisible locally and breaks every link
// preview at once in production.
//
// The production fallback is deliberately the real domain, not localhost. If
// NEXT_PUBLIC_APP_URL ever goes missing from the Vercel project, falling back
// to localhost would ship `og:image=http://localhost:3000/og.png` to real
// visitors — a preview that renders nothing, on every platform, silently.
// Falling back to the live origin fails safe instead.
const PRODUCTION_ORIGIN = "https://nextbigidea.dev";

const configured =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.NODE_ENV === "production" ? PRODUCTION_ORIGIN : "http://localhost:3000");

// Trailing slashes turn `${SITE_URL}/ideas` into a double-slashed URL, which
// Google treats as a separate (duplicate) page.
export const SITE_URL = configured.replace(/\/+$/, "");
