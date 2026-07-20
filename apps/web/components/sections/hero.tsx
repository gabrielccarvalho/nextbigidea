import Link from "next/link";
import { Eyebrow } from "@/components/section";
import { HeroAnimation } from "@/components/sections/hero-animation";
import { HERO } from "@/lib/content";

export function Hero() {
  return (
    <section className="pb-16 pt-12 sm:pt-20">
      {/* The pitch stays in a readable measure; the animation below spans the full
          width. It was previously a grid column ~500px wide, which clamped the
          spawn radius to its floor and made nine 176px cards overlap into a clump. */}
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center">
        <Eyebrow>{HERO.eyebrow}</Eyebrow>
        {/* This h1 must remain the LCP element — never let the animation take it. */}
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          {HERO.headline}
        </h1>
        <p className="text-pretty text-muted-foreground">{HERO.subhead}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
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

      <div className="mx-auto mt-14 max-w-7xl px-6">
        <HeroAnimation />
      </div>
    </section>
  );
}
