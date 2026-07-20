import { desc } from "drizzle-orm";
import { db, ideas } from "@workspace/db";
import { requireAdmin } from "@/lib/require-admin";
import { publishIdea, unpublishIdea, setFreeIdea } from "./actions";

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch {
    return <main className="p-10">Forbidden.</main>;
  }

  const rows = await db.select().from(ideas).orderBy(desc(ideas.createdAt)).limit(200);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Admin — idea review</h1>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Title</th>
            <th>Niche</th>
            <th>Score</th>
            <th>Status</th>
            <th>Free</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((idea) => (
            <tr key={idea.id} className="border-b align-top">
              <td className="py-2 font-medium">{idea.title}</td>
              <td>{idea.niche}</td>
              <td>{idea.demandScore}</td>
              <td>{idea.status}</td>
              <td>{idea.isFree ? "yes" : "no"}</td>
              <td className="space-x-2 py-2">
                {idea.status === "draft" ? (
                  <form action={publishIdea} className="inline">
                    <input type="hidden" name="id" value={idea.id} />
                    <button className="rounded bg-foreground px-2 py-1 text-xs text-background">
                      Publish
                    </button>
                  </form>
                ) : (
                  <form action={unpublishIdea} className="inline">
                    <input type="hidden" name="id" value={idea.id} />
                    <button className="rounded border px-2 py-1 text-xs">Unpublish</button>
                  </form>
                )}
                <form action={setFreeIdea} className="inline">
                  <input type="hidden" name="id" value={idea.id} />
                  <input type="hidden" name="isFree" value={idea.isFree ? "false" : "true"} />
                  <button className="rounded border px-2 py-1 text-xs">
                    {idea.isFree ? "Unset free" : "Mark free"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
