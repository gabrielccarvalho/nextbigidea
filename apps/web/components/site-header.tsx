"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { NAV } from "@/lib/content";
import { Logo } from "@/components/logo";
import { useSession } from "@/lib/auth-client";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300",
        scrolled && "border-b border-border bg-background/80 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
        <nav className="ml-auto hidden items-center gap-6 sm:flex">
          {NAV.links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href={session?.user ? "/account" : "/login"}
          className={cn(
            "text-sm text-muted-foreground transition-colors hover:text-foreground",
            "ml-auto sm:ml-0",
          )}
        >
          {session?.user ? "Account" : "Sign in"}
        </Link>
        <Link
          href={NAV.cta.href}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {NAV.cta.label}
        </Link>
      </div>
    </header>
  );
}
