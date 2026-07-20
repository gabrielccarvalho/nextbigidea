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

export async function publishIdea(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db
    .update(ideas)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(ideas.id, id));
  revalidatePath("/admin");
  revalidatePath("/ideas");
}

export async function unpublishIdea(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db.update(ideas).set({ status: "draft" }).where(eq(ideas.id, id));
  revalidatePath("/admin");
  revalidatePath("/ideas");
}

export async function setFreeIdea(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const isFree = formData.get("isFree") === "true";
  await db.update(ideas).set({ isFree }).where(eq(ideas.id, id));
  revalidatePath("/admin");
  revalidatePath("/ideas");
}
