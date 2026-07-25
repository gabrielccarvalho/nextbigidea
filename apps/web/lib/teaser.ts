import type { Idea } from "@workspace/db";

// A branded type that ONLY `toTeaserIdea` can produce. Used by the locked
// idea detail view (app/ideas/[slug]), the one place an unpaid viewer may
// still see an idea's title and niche.
//
// Why not just `Pick<Idea, "title" | "niche">`: TypeScript's excess-property
// check fires only on object LITERALS. A plain Pick would still accept a
// full Idea being passed where a teaser is expected, because Idea is
// structurally assignable to a subset of itself — no compile error, and every
// locked field silently crosses the wire again. The brand makes a full Idea
// structurally incompatible, so the leak becomes unrepresentable rather than
// merely absent today.
declare const teaserBrand: unique symbol;

export type TeaserIdea = Pick<Idea, "title" | "niche"> & {
  readonly [teaserBrand]: true;
};

export function toTeaserIdea(idea: Pick<Idea, "title" | "niche">): TeaserIdea {
  return { title: idea.title, niche: idea.niche } as TeaserIdea;
}
