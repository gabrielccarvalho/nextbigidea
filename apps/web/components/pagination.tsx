import Link from "next/link";
import { cn } from "@workspace/ui/lib/utils";
import { pageWindow } from "@/lib/pagination";

// Plain links, no client state: the page number lives in the URL (?page=N) so
// every page is shareable, reloadable, and back-button friendly. Page 1 links
// to the bare path to keep a single canonical URL for the first page.
export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const href = (p: number) => (p === 1 ? basePath : `${basePath}?page=${p}`);

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="rounded-md px-3 py-1.5 hover:bg-muted">
          ← Prev
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-muted-foreground/50">← Prev</span>
      )}

      {pageWindow(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-2 text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 hover:bg-muted",
              p === page && "bg-foreground text-background hover:bg-foreground",
            )}
          >
            {p}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link href={href(page + 1)} className="rounded-md px-3 py-1.5 hover:bg-muted">
          Next →
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-muted-foreground/50">Next →</span>
      )}
    </nav>
  );
}
