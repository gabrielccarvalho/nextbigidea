"use client";

import { useEffect, useRef, useState } from "react";
import { SAMPLE_IDEAS, SAMPLE_POSTS, SOURCES, type SampleIdea } from "@/lib/content";

const GATHER_MS = 3400;
const CONDENSE_MS = 1000;
const FORM_AT = 4400;
const RECEDE_AT = 8200;
const CYCLE_MS = 9100;

type Phase = "gathering signals" | "condensing" | "scored idea";

export function HeroAnimation() {
  const stageRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);

  const [idea, setIdea] = useState<SampleIdea>(SAMPLE_IDEAS[0]!);
  const [phase, setPhase] = useState<Phase>("gathering signals");
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    // NOTE: this effect must depend on [reduced] ONLY. It calls setIdea() on
    // every cycle; if `idea` were a dependency the effect would tear itself
    // down and restart on each cycle, producing an infinite restart loop.
    // Read the current idea from SAMPLE_IDEAS inside the closure instead.

    // Reduced motion renders the composed final state: a finished card with a
    // real score. Never an empty stage.
    if (reduced) {
      const first = SAMPLE_IDEAS[0]!;
      setIdea(first);
      setPhase("scored idea");
      if (scoreRef.current) scoreRef.current.textContent = String(first.score);
      if (cardRef.current) cardRef.current.style.opacity = "1";
      return;
    }

    const stage = stageRef.current;
    const core = coreRef.current;
    const ring = ringRef.current;
    const card = cardRef.current;
    if (!stage || !core || !ring || !card) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const spawned: HTMLElement[] = [];
    let cancelled = false;
    let cycleIndex = 0;

    const after = (fn: () => void, ms: number) => {
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    };

    const spawnPost = (text: string, i: number, total: number) => {
      const source = SOURCES[i % SOURCES.length]!;
      const angle = (i / total) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const rx = Math.max(stage.clientWidth * 0.6, 300) + Math.random() * 70;
      const ry = Math.max(stage.clientHeight * 0.7, 220) + Math.random() * 50;
      const x0 = Math.cos(angle) * rx;
      const y0 = Math.sin(angle) * ry;
      const rot = (Math.random() - 0.5) * 16;

      const el = document.createElement("div");
      el.className =
        "absolute left-1/2 top-1/2 -ml-[88px] -mt-5 w-44 rounded-lg border border-border " +
        "bg-card px-2.5 py-2 shadow-lg will-change-transform";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML =
        `<div class="mb-1 flex items-center gap-1.5 font-mono text-[0.5rem] uppercase tracking-[0.13em] text-muted-foreground">` +
        `<span class="size-1.5 shrink-0 rounded-full" style="background:${source.color}"></span>${source.name}</div>` +
        `<div class="text-[0.6rem] leading-snug text-muted-foreground"></div>`;
      // textContent, not innerHTML, so sample copy can never inject markup.
      el.lastElementChild!.textContent = text;
      stage.appendChild(el);
      spawned.push(el);

      const delay = i * 190 + Math.random() * 90;

      el.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) rotate(${rot}deg) scale(.86)`, opacity: 0 },
          { offset: 0.28, transform: `translate(${x0 * 0.8}px, ${y0 * 0.8}px) rotate(${rot * 0.7}deg) scale(1)`, opacity: 1 },
          { transform: `translate(${x0 * 0.42}px, ${y0 * 0.42}px) rotate(${rot * 0.35}deg) scale(.97)`, opacity: 1 },
        ],
        { duration: 2600, delay, easing: "cubic-bezier(.22,.7,.35,1)", fill: "forwards" },
      );

      after(() => {
        el.animate(
          [
            { transform: `translate(${x0 * 0.42}px, ${y0 * 0.42}px) rotate(${rot * 0.35}deg) scale(.97)`, opacity: 1 },
            { offset: 0.55, transform: `translate(${x0 * 0.16}px, ${y0 * 0.16}px) scale(.55)`, opacity: 0.9 },
            { transform: "translate(0,0) scale(.06)", opacity: 0 },
          ],
          { duration: CONDENSE_MS, easing: "cubic-bezier(.55,0,.85,.35)", fill: "forwards" },
        );
      }, GATHER_MS);
    };

    const countUp = (target: number) => {
      const node = scoreRef.current;
      if (!node) return;
      const start = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const p = Math.min(1, (now - start) / 1100);
        node.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const cycle = () => {
      spawned.forEach((el) => el.remove());
      spawned.length = 0;

      const current = SAMPLE_IDEAS[cycleIndex % SAMPLE_IDEAS.length]!;
      cycleIndex += 1;
      setIdea(current);
      setPhase("gathering signals");
      card.style.opacity = "0";
      core.style.opacity = "0";
      ring.style.opacity = "0";

      SAMPLE_POSTS.forEach((text, i) => spawnPost(text, i, SAMPLE_POSTS.length));

      after(() => {
        setPhase("condensing");
        core.style.opacity = "1";
        core.animate(
          [{ transform: "scale(.2)", opacity: 0.2 }, { transform: "scale(1.5)", opacity: 1 }],
          { duration: CONDENSE_MS, easing: "ease-in", fill: "forwards" },
        );
      }, GATHER_MS);

      after(() => {
        core.animate(
          [{ transform: "scale(1.5)", opacity: 1 }, { transform: "scale(5)", opacity: 0 }],
          { duration: 520, easing: "ease-out", fill: "forwards" },
        );
        ring.style.opacity = "1";
        ring.animate(
          [{ transform: "scale(.3)", opacity: 0.9 }, { transform: "scale(9)", opacity: 0 }],
          { duration: 900, easing: "cubic-bezier(.1,.7,.3,1)", fill: "forwards" },
        );

        card.style.opacity = "1";
        card.animate(
          [
            { opacity: 0, transform: "scale(.42) translateY(6px)" },
            { offset: 0.6, opacity: 1, transform: "scale(1.04)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          { duration: 820, easing: "cubic-bezier(.2,.8,.25,1)", fill: "forwards" },
        );

        setPhase("scored idea");
        countUp(current.score);
      }, FORM_AT);

      after(() => {
        card.animate(
          [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.94)" }],
          { duration: 620, easing: "ease-in", fill: "forwards" },
        );
      }, RECEDE_AT);

      after(cycle, CYCLE_MS);
    };

    cycle();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      spawned.forEach((el) => el.remove());
    };
    // Intentionally [reduced] only — see the note at the top of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <div
      ref={stageRef}
      aria-hidden="true"
      className="relative h-[380px] overflow-hidden rounded-xl border border-border sm:h-[440px]"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 12%, var(--background)) 0%, var(--background) 62%)",
      }}
    >
      <span className="absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted-foreground">
        {phase}
      </span>

      <div
        ref={ringRef}
        className="absolute left-1/2 top-1/2 -ml-2.5 -mt-2.5 size-5 rounded-full border border-primary opacity-0 will-change-transform"
      />
      <div
        ref={coreRef}
        className="absolute left-1/2 top-1/2 -ml-1 -mt-1 size-2.5 rounded-full bg-primary opacity-0 will-change-transform"
        style={{ boxShadow: "0 0 22px 8px color-mix(in oklch, var(--primary) 50%, transparent)" }}
      />

      <div
        ref={cardRef}
        className="absolute left-1/2 top-1/2 -ml-[135px] -mt-[62px] w-[270px] rounded-xl border border-border bg-card p-4 opacity-0 shadow-2xl will-change-transform"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold tracking-tight">{idea.title}</span>
          <span className="text-right">
            <span ref={scoreRef} className="block font-mono text-xl font-semibold text-primary">
              0
            </span>
            <span className="block font-mono text-[0.5rem] uppercase tracking-[0.14em] text-muted-foreground">
              demand
            </span>
          </span>
        </div>
        <div className="mt-2 flex gap-3 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-muted-foreground">
          <span>{idea.asks} asks</span>
          <span>est. {idea.mrr} MRR</span>
        </div>
        <div className="my-2.5 h-px bg-border" />
        <p className="text-[0.65rem] italic leading-relaxed text-muted-foreground">{idea.evidence}</p>
        <p className="mt-2 font-mono text-[0.5rem] uppercase tracking-[0.13em] text-primary">
          built from {idea.asks} posts · {SOURCES.length} sources
        </p>
      </div>
    </div>
  );
}
