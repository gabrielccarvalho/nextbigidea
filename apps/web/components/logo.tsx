import { cn } from "@workspace/ui/lib/utils";
import { COMPANY } from "@/lib/content";

// The brand wordmark: lowercase "next.bigthing" with the separating dot in the brand green
// (--primary) and the "thing" suffix dropped back to muted. The accent is deliberately the
// primary token, NOT --destructive (the coral error red), so the mark never collides with
// error states. `COMPANY.name` is the accessible label; the styled letters are decorative.
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn("font-semibold tracking-tight text-foreground", className)}
      aria-label={COMPANY.name}
    >
      <span aria-hidden="true">
        next<span className="text-primary">.</span>big<span className="text-muted-foreground">thing</span>
      </span>
    </span>
  );
}
