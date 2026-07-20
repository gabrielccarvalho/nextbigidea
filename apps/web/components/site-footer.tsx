import Link from "next/link";
import { COMPANY, FOOTER } from "@/lib/content";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-3">
          {FOOTER.columns.map((col) => (
            <div key={col.heading}>
              <h3 className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-2">
                {col.links.map((link) => {
                  const external = link.href.startsWith("http");
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-border pt-6">
          <p className="font-mono text-[0.65rem] leading-relaxed text-muted-foreground">
            {COMPANY.name} is operated by {COMPANY.legalName} (CNPJ {COMPANY.cnpj}).
          </p>
        </div>
      </div>
    </footer>
  );
}
