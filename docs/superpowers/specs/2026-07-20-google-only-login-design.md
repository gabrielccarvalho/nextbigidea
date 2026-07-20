# Google-only login + dedicated `/login` page

**Date:** 2026-07-20
**Status:** Approved (design + mockup), implementing.

## Goal

Replace the magic-link + Google auth with **Google OAuth only**, and give sign-in a
real home: a dedicated `/login` route with a "sell while you sign in" split layout,
instead of the current setup where auth is embedded in the signed-out `/account` page
and reached via a clumsy checkout→401→redirect bounce.

## Decisions

- **Provider:** Google only. Magic-link (and its Resend send path) removed. Resend stays
  a dependency — `lib/payments/alert.ts` still uses it for payment-failure alerts.
- **Surface:** new dedicated `/login` route (server component). Not a modal.
- **Layout:** two-column split — left "sell" (value bullets + R$110/year offer), right
  "act" (single Continue-with-Google button). Stacks to one column on mobile.
- **Brand:** extract the wordmark into a reusable `<Logo />` component, accent in the
  app's real brand green (`--primary`), NOT the coral `--destructive` (error) token.

## Changes

### Auth
- `lib/auth.ts` — drop `magicLink` plugin + Resend send block. Google only.
- `lib/auth-client.ts` — drop `magicLinkClient()`.
- Delete `components/auth-buttons.tsx` (replaced by `/login`; its signed-in branch was
  already dead code).

### New surface
- `app/login/page.tsx` — server component. If already signed in → `redirect(callbackURL)`.
  Renders the split layout. Reads `?next=` and sanitizes it.
- `components/login-button.tsx` — client child; the Google button (`signIn.social`).
- `components/logo.tsx` — reusable brand wordmark, used in the header and on `/login`.
- `lib/content.ts` — new `LOGIN` block (copy), reusing `PRICING` so numbers never drift.

### Security
- `lib/safe-next.ts` — pure `safeNext(raw)`: only same-origin relative paths survive;
  absolute URLs, protocol-relative `//host`, backslash tricks, and malformed encoding all
  collapse to the default (`/ideas`). This is the one piece of real logic → TDD.
  Unit-tested in `lib/safe-next.test.ts` (vitest `include: lib/**/*.test.ts`).

### Routing cleanups
- `components/paywall-cta.tsx` — when unauthenticated, link to `/login?next=<pathname>`
  instead of the checkout→401 bounce. Authenticated behavior unchanged.
- `app/account/page.tsx` — signed-out branch → `redirect("/login?next=/account")`.
  Drop the `AuthButtons` import and the now-unused `ACCOUNT_PAGE.signInPrompt`.
- `components/site-header.tsx` — brand becomes `<Logo />`; add a session-aware "Sign in"
  link (→ `/login`) for signed-out visitors.

## Known dependency / risk

Google-only means **nobody can sign in until real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
are set** (currently empty; build warns). The Google OAuth app needs
`http://localhost:3000/api/auth/callback/google` (+ prod URL) as authorized redirect URIs.
For local end-to-end payment testing, direct session seeding remains the fallback, since a
real Google handshake can't be completed headlessly.

## Testing

- `safeNext` — unit tests (the only real logic).
- Everything else — wiring/markup, verified by typecheck + build + a manual OAuth click.
