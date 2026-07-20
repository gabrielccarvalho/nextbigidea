import Link from "next/link";
import { Eyebrow } from "@/components/section";
import { HeroAnimation } from "@/components/sections/hero-animation";
import { HERO } from "@/lib/content";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-8 pt-12 sm:pt-20">
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center">
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

      {/* Mobile: the field flows below the pitch, so drifting cards never cross
          the subhead. lg and up: it goes behind, full-bleed, as the ambient
          field the pitch sits on. */}
      <div
        aria-hidden
        className="pointer-events-none relative mt-6 lg:absolute lg:inset-x-0 lg:top-32 lg:-z-10 lg:mt-0"
      >
        <HeroAnimation />
      </div>

      {/* Reserves the field's height at lg only — below that the field is in
          normal flow and takes its own space. */}
      <div aria-hidden className="hidden lg:block lg:h-[430px]" />
    </section>
  );
}
