// Pure: no DB, no session, no next/headers import. This is the only
// unit-tested piece of the admin gate — kept in its own module, free of any
// `@workspace/db`/`@/lib/auth` import, because @workspace/db throws at import
// time when DATABASE_URL is unset (same split as access.ts vs viewer-access.ts).
//
// An unset/empty `adminIds` must grant nobody — never treat "no allowlist
// configured" as "everyone is an admin".
export function isAdmin(userId: string | null, adminIds: string): boolean {
  if (!userId) return false;
  const set = adminIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return set.includes(userId);
}
