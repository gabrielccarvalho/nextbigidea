import { cn } from "@workspace/ui/lib/utils";

// Uniform py-20/py-28 on every section is what produced the dead voids on the
// old page — a two-sentence section got the same vertical budget as a six-cell
// grid. Density is chosen per-section by content weight.
const DENSITY = {
  tight: "py-12 sm:py-16",
  default: "py-20 sm:py-28",
  open: "py-28 sm:py-40",
} as const;

export function Section({
  id,
  className,
  ariaLabel,
  density = "default",
  children,
}: {
  id?: string;
  className?: string;
  ariaLabel?: string;
  density?: keyof typeof DENSITY;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={ariaLabel}
      className={cn("mx-auto max-w-6xl scroll-mt-24 px-6", DENSITY[density], className)}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-primary">
      <span aria-hidden className="h-px w-6 bg-primary/60" />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("flex flex-col gap-4", align === "center" && "items-center text-center")}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {intro ? (
        <p className={cn("max-w-2xl text-pretty text-muted-foreground", align === "center" && "mx-auto")}>
          {intro}
        </p>
      ) : null}
    </div>
  );
}

// The connective tissue of the page. A single hairline runs the height of the
// list with a node per step, so sections read as entries in one record rather
// than as independent floating cards.
export function Rail({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ol className={cn("relative border-l border-border pl-8", className)}>{children}</ol>;
}

// `ref` and `dataRegion` exist so the Dissection (Task 4) can observe these
// elements without reimplementing the markup. React 19 passes ref as a normal
// prop — no forwardRef needed.
export function RailStep({
  n,
  title,
  body,
  active = true,
  dataRegion,
  className,
  ref,
}: {
  n: string;
  title: string;
  body: string;
  active?: boolean;
  dataRegion?: string;
  className?: string;
  ref?: React.Ref<HTMLLIElement>;
}) {
  return (
    <li
      ref={ref}
      data-region={dataRegion}
      className={cn(
        "relative pb-10 transition-opacity duration-500 last:pb-0",
        active ? "opacity-100" : "opacity-30",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute -left-[33px] top-1.5 size-1.5 rounded-full ring-4 ring-background transition-colors duration-500",
          active ? "bg-chart-1" : "bg-border",
        )}
      />
      <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
        {n}
      </span>
      <h3 className="mt-2 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}
