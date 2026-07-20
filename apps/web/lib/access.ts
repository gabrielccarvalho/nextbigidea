// Pure: no DB, no session, no next/headers import. This is the only
// unit-tested piece of the paywall — kept in its own module, free of any
// `@workspace/db` import, because that package throws at import time when
// DATABASE_URL is unset (mirrors the stages/idea.ts vs stages/enrich.ts
// split in packages/pipeline).
export function computeAccess(hasPaidPurchase: boolean): { hasFullAccess: boolean } {
  return { hasFullAccess: hasPaidPurchase };
}
