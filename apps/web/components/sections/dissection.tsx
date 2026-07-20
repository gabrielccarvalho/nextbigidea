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
    // Height matters as much as width. The pinned card runs ~560px under a 64px
    // sticky header at `lg:top-28`; on a short viewport (a 1024x768 laptop) its
    // lower regions sit below the fold while pinned. Passage 04 would then
    // highlight the competition block off-screen — the reader sees the other
    // three regions dim and nothing appear to happen. Below this threshold the
    // section falls back to the plain stacked layout.
    const widthQuery = window.matchMedia("(min-width: 1024px) and (min-height: 820px)");

    let frame = 0;
    let listening = false;

    // Always resolves to exactly ONE step: whichever passage's midpoint sits
    // nearest the focus line. The previous implementation used an
    // IntersectionObserver with a narrow `-35%` band, which meant a passage
    // could travel through without ever satisfying the threshold — so steps
    // were skipped, and the highlight dropped out entirely in the gaps between
    // entries. Measuring positions directly has no dead zones.
    const pick = () => {
      frame = 0;
      const focus = window.innerHeight * 0.42;
      let best: { key: SpecimenRegion; dist: number } | null = null;
      for (const node of stepRefs.current) {
        if (!node) continue;
        const box = node.getBoundingClientRect();
        const dist = Math.abs(box.top + box.height / 2 - focus);
        const key = node.dataset.region as SpecimenRegion;
        if (!best || dist < best.dist) best = { key, dist };
      }
      if (best) setActive(best.key);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(pick);
    };

    const stop = () => {
      if (listening) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        listening = false;
      }
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      // A stale `active` would leave passages dimmed in a stacked layout with
      // nothing pinned to explain why.
      setActive(null);
    };

    const sync = () => {
      stop();
      // Reduced motion and narrow viewports both get the composed state: every
      // passage lit, card fully readable, no scroll tracking.
      if (motionQuery.matches || !widthQuery.matches) return;

      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      listening = true;
      pick();
    };

    sync();
    motionQuery.addEventListener("change", sync);
    widthQuery.addEventListener("change", sync);

    return () => {
      motionQuery.removeEventListener("change", sync);
      widthQuery.removeEventListener("change", sync);
      stop();
    };
  }, []);

  return (
    <Section id="what-you-get" density="tight">
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
              // Generous travel at lg so each step holds the highlight long
              // enough to read before the next one takes it. Below lg the
              // section is a plain stack and needs no dwell.
              className="pb-14 lg:pb-[38vh] lg:last:pb-0"
            />
          ))}
        </Rail>
      </div>
    </Section>
  );
}
