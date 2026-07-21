import { cn } from "@workspace/ui/lib/utils";
import { COMPANY } from "@/lib/content";

// The brand wordmark: lowercase "nextbigidea" with the "idea" suffix dropped back to muted,
// which is the mark's only accent. `COMPANY.name` is the accessible label; the styled letters
// are decorative.
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn("font-semibold tracking-tight text-foreground", className)}
      aria-label={COMPANY.name}
    >
      <span aria-hidden="true">
        nextbig<span className="text-muted-foreground">idea</span>
      </span>
    </span>
  );
}
