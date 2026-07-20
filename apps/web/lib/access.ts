// Pure: no DB, no session, no next/headers import. This is the only
// unit-tested piece of the paywall — kept in its own module, free of any
// `@workspace/db` import, because that package throws at import time when
// DATABASE_URL is unset (mirrors the stages/idea.ts vs stages/enrich.ts
// split in packages/pipeline).
//
// Access is derived from the access window a payment bought, never from a stored
// subscription status. A customer who cancels mid-period keeps what they paid for
// until `periodEnd`; a mirrored ACTIVE/CANCELLED flag would revoke immediately and
// would drift whenever an event is missed, retried, or delivered out of order.
//
// `now` is a parameter, never `new Date()` — expiry is untestable otherwise.
export function computeAccess(
  periodEnd: Date | null,
  now: Date,
): { hasFullAccess: boolean; periodEnd: Date | null } {
  return { hasFullAccess: periodEnd !== null && periodEnd.getTime() > now.getTime(), periodEnd };
}
