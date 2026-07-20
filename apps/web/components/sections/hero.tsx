import Link from "next/link";
import { Eyebrow } from "@/components/section";
import { HeroAnimation } from "@/components/sections/hero-animation";
import { HERO } from "@/lib/content";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 sm:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col gap-6">
          <Eyebrow>{HERO.eyebrow}</Eyebrow>
          {/* This h1 must remain the LCP element — never let the animation take it. */}
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {HERO.headline}
          </h1>
          <p className="max-w-xl text-pretty text-muted-foreground">{HERO.subhead}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={HERO.primaryHref}
              className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {HERO.primaryCta} &rarr;
            </Link>
            <Link
              href={HERO.secondaryHref}
              className="rounded-md border border-border px-6 py-3 font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {HERO.secondaryCta}
            </Link>
          </div>
        </div>
        <HeroAnimation />
      </div>
    </section>
  );
}
