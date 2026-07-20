// Sanitizes a post-login redirect target (`?next=`) to a same-origin relative path.
//
// `next` is fully attacker-controlled — anyone can craft a `/login?next=//evil.com` link —
// and it is fed straight into `redirect()` / better-auth's `callbackURL`. Without this, that
// is a textbook open redirect: a phishing page that genuinely lives on your domain right up
// until it bounces the user to an attacker's clone. Everything that could leave the site
// collapses to the default; only a plain root-anchored relative path survives.
//
// Pure and unit-tested (lib/safe-next.test.ts) — it is the one piece of real logic in the
// login change, so it is tested in isolation rather than through the page.
const DEFAULT_NEXT = "/ideas";

// True if the string contains any C0 control char, space, or DEL (char code <= 0x20 or 0x7F),
// or any other Unicode whitespace. Written as a code-point scan rather than a regex literal so
// no raw control byte ever lives in this source file. These are used to smuggle past naive
// path checks or to inject headers, so any occurrence disqualifies the value.
function hasControlOrWhitespace(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return /\s/.test(value);
}

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;

  // Decode first, then validate: an attacker can hide `//evil.com` as `%2F%2Fevil.com`, so the
  // checks below must run against what the browser will ultimately resolve, not the raw text.
  // Malformed encoding throws here — treat it as hostile, not as a path.
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return DEFAULT_NEXT;
  }

  // Must be anchored at the site root...
  if (!value.startsWith("/")) return DEFAULT_NEXT;
  // ...but NOT protocol-relative: `//host` and `/\host` both navigate off-site (browsers treat
  // a backslash as a forward slash when resolving URLs)...
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_NEXT;
  // ...and free of any backslash, control character, or whitespace.
  if (value.includes("\\")) return DEFAULT_NEXT;
  if (hasControlOrWhitespace(value)) return DEFAULT_NEXT;

  return value;
}
