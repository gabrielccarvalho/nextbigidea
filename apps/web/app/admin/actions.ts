"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, ideas } from "@workspace/db";
import { requireAdmin } from "@/lib/require-admin";

// Every action below calls requireAdmin() as its FIRST statement, before any
// DB access. Server actions are independently callable HTTP endpoints — a
// check performed only in app/admin/page.tsx would protect the page render,
// not these endpoints. requireAdmin() throws if the caller is not an admin,
// which aborts the action before `db` is ever touched.

// `Number(formData.get("id"))` yields 0 for a missing field and NaN for a
// malformed one, both of which flow straight into `eq(ideas.id, ...)` — a
// silent no-op or a driver-level error rather than a clear failure.
function parseIdeaId(formData: FormData): number {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("invalid idea id");
  }
  return id;
}

export async function publishIdea(formData: FormData) {
  await requireAdmin();
  const id = parseIdeaId(formData);
  await db
    .update(ideas)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(ideas.id, id));
  revalidatePath("/admin");
  revalidatePath("/ideas");
}

export async function unpublishIdea(formData: FormData) {
  await requireAdmin();
  const id = parseIdeaId(formData);
  await db.update(ideas).set({ status: "draft" }).where(eq(ideas.id, id));
  revalidatePath("/admin");
  revalidatePath("/ideas");
}

export async function setFreeIdea(formData: FormData) {
  await requireAdmin();
  const id = parseIdeaId(formData);
  const isFree = formData.get("isFree") === "true";
  await db.update(ideas).set({ isFree }).where(eq(ideas.id, id));
  revalidatePath("/admin");
  revalidatePath("/ideas");
}
