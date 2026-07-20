import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdmin } from "./admin";

// Live session check. Requires a live Postgres + session, neither of which
// exists in this environment — not unit-tested; see admin.test.ts for the
// pure allowlist logic this delegates to.
//
// Every server action that mutates admin-only state MUST call this as its
// first statement, before any DB access. A check performed only in the page
// component protects the page render, not the server action endpoint — server
// actions are independently callable HTTP endpoints regardless of whether the
// page that renders their <form> was ever loaded.
export async function requireAdmin(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  if (!isAdmin(userId, process.env.ADMIN_USER_IDS ?? "")) {
    throw new Error("forbidden");
  }
  return userId!;
}
