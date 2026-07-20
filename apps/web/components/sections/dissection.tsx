"use client";

import { useEffect, useRef, useState } from "react";
import { Rail, RailStep, Section, SectionHeading } from "@/components/section";
import { SpecimenCard, type SpecimenRegion } from "@/components/specimen-card";
import { DISSECTION, SPECIMEN } from "@/lib/content";

export function Dissection() {
  const [active, setActive] = useState<SpecimenRegion>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const widthQuery = window.matchMedia("(min-width: 1024px)");

    let observer: IntersectionObserver | null = null;

    const teardown = () => {
      observer?.disconnect();
      observer = null;
      // Clearing the highlight is the whole point: a stale `active` would leave
      // passages at opacity-30 and card regions dimmed in a stacked layout with
      // nothing pinned to explain why.
      setActive(null);
    };

    const sync = () => {
      teardown();
      // Reduced motion and narrow viewports both get the composed state: every
      // passage lit, card fully readable, no scroll tracking.
      if (motionQuery.matches || !widthQuery.matches) return;

      const nodes = stepRefs.current.filter((n): n is HTMLLIElement => n !== null);
      if (nodes.length === 0) return;

      observer = new IntersectionObserver(
        (entries) => {
          // Pick the entry nearest the vertical middle of the viewport so the
          // highlight follows reading position rather than whichever element
          // happened to fire last.
          const mid = window.innerHeight / 2;
          let best: { key: SpecimenRegion; dist: number } | null = null;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const box = entry.boundingClientRect;
            const dist = Math.abs(box.top + box.height / 2 - mid);
            const key = (entry.target as HTMLElement).dataset.region as SpecimenRegion;
            if (!best || dist < best.dist) best = { key, dist };
          }
          if (best) setActive(best.key);
        },
        { rootMargin: "-35% 0px -35% 0px", threshold: 0 },
      );

      nodes.forEach((n) => observer?.observe(n));
    };

    sync();
    motionQuery.addEventListener("change", sync);
    widthQuery.addEventListener("change", sync);

    return () => {
      motionQuery.removeEventListener("change", sync);
      widthQuery.removeEventListener("change", sync);
      teardown();
    };
  }, []);

  return (
    <Section id="anatomy" density="tight">
      <SectionHeading
        eyebrow={SPECIMEN.eyebrow}
        title={SPECIMEN.sectionTitle}
        intro={SPECIMEN.intro}
      />
      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SpecimenCard highlight={active} />
        </div>

        {/* Composes RailStep — the page has exactly one rail implementation. */}
        <Rail className="lg:pt-16">
          {DISSECTION.steps.map((step, i) => (
            <RailStep
              key={step.key}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              dataRegion={step.key}
              n={step.n}
              title={step.title}
              body={step.body}
              // No active region means nothing has been chosen yet (mobile,
              // reduced motion, pre-scroll) — show everything.
              active={active === null || active === step.key}
              className="pb-14"
            />
          ))}
        </Rail>
      </div>
    </Section>
  );
}
