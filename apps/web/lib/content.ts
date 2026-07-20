// Single source of truth for marketing and legal copy.
//
// Copy rules enforced by lib/content.test.ts:
//   - no banned marketing adjectives or invented social proof
//   - exactly three sources (Reddit, Hacker News, Product Hunt)
//   - price is stated in BRL; USD only ever as a parenthetical
//   - we scan weekly, we publish monthly — never "new ideas weekly"

export const COMPANY = {
  name: "NextBigThing",
  legalName: "GABRIEL CAMPOS DOS SANTOS P DE CARVALHO LTDA",
  cnpj: "58.378.419/0001-61",
  email: "gabrielccarvalhopro@gmail.com",
  governingLaw: "the Federative Republic of Brazil",
  jurisdictionForum: "the Comarca de São Paulo/SP",
  lastUpdated: "July 20, 2026",
} as const;

export const PRICING = {
  amountBRL: "R$110",
  amountUSDApprox: "≈US$20",
  term: "year",
  freeIdeaCount: 5,
  refundDays: 7,
} as const;

export const SOURCES = [
  { name: "Reddit", color: "#ff4500" },
  { name: "Hacker News", color: "#ff6600" },
  { name: "Product Hunt", color: "#da552f" },
] as const;

export const HERO = {
  eyebrow: "Evidence, not brainstorms",
  headline: "Every idea here has someone asking for it.",
  subhead:
    "Every week we read public posts across Reddit, Hacker News, and Product Hunt looking for people describing a product that doesn't exist yet — then score the strongest signals and link each one back to the posts that prove it. Nobody's built them yet.",
  primaryCta: "Browse the ideas",
  primaryHref: "/ideas",
  secondaryCta: "See how it works",
  secondaryHref: "/#how-it-works",
} as const;

export const PROBLEM = {
  eyebrow: "Why most side projects die",
  title: "Building something nobody asked for is the default outcome.",
  body: "You can ship fast, write clean code, and still spend six months on a product with no demand behind it. The hard part was never the building. It's knowing what's worth building.",
} as const;

export const HOW_IT_WORKS = {
  eyebrow: "How it works",
  title: "Demand goes in. Scored ideas come out.",
  steps: [
    {
      n: "01",
      title: "Scan",
      body: "Every week we pull public posts from Reddit, Hacker News, and Product Hunt.",
    },
    {
      n: "02",
      title: "Cluster & score",
      body: "Posts describing the same missing product get grouped, scored for demand, and sized for revenue.",
    },
    {
      n: "03",
      title: "You build",
      body: "You get the idea, the numbers behind it, and links to every post that produced it.",
    },
  ],
} as const;

export const ANATOMY = {
  eyebrow: "What you get",
  title: "Anatomy of an idea.",
  intro: "Every entry carries the same evidence, so you can judge it the way you'd judge your own research.",
  callouts: [
    { label: "Demand score", body: "0–100, derived from how many people asked and how strongly." },
    { label: "Ask count", body: "How many distinct posts describe this missing product." },
    { label: "Estimated MRR", body: "A range derived from comparable products — shown as a range, because it is one." },
    { label: "Competition notes", body: "What already exists, and where it falls short of what people asked for." },
    { label: "Validation signals", body: "The specific phrases that indicate willingness to pay." },
    { label: "Source links", body: "Every post behind the idea, linked. Go read them yourself." },
  ],
  closer: "Every number here traces back to a post you can go read yourself.",
} as const;

export const WHY_EVIDENCE = {
  eyebrow: "Why evidence wins",
  title: "Why not just ask an AI for fifty ideas?",
  intro: "You can. You'll get fifty plausible sentences. Here's the difference.",
  rows: [
    { generated: "Plausible-sounding ideas invented on demand", ours: "Ideas extracted from posts real people wrote" },
    { generated: "No way to tell if anyone wants it", ours: "Ask counts from named sources" },
    { generated: "Confident revenue guesses", ours: "Ranges derived from comparable products, shown as ranges" },
    { generated: "Unfalsifiable", ours: "Every claim links to the post behind it" },
  ],
  generatedLabel: "Generated idea lists",
  oursLabel: "NextBigThing",
} as const;

export const PAYWALL_CTA = {
  headlinePrefix: "Unlock every idea",
  subtext: "Card payment, renews annually. Cancel any time — access runs to the end of your paid period.",
  ctaAuthenticated: "Unlock now",
  ctaSignedOut: "Sign in to unlock",
} as const;

export const IDEAS_PAGE = {
  title: "SaaS demand ideas",
  subhead: "Sourced from Reddit, Hacker News, and Product Hunt. New ideas every month.",
} as const;

export const IDEA_DETAIL = {
  lockedMessage:
    "This idea is locked. Subscribe to see the demand evidence, sources, MRR estimate, and validation signals.",
  opportunityHeading: "The opportunity",
  mrrHeading: "MRR estimate",
  mrrBody:
    "is a conservative, directional range — not a forecast. It is derived from audience-size signals in the source posts, a plausible price point for this niche, and a low assumed conversion rate. Treat it as a heuristic for prioritizing ideas, not a prediction of actual revenue.",
  competitionHeading: "Competition",
  validationHeading: "Validation signals",
  sourcesHeading: "Sources",
} as const;

export const ACCOUNT_PAGE = {
  title: "Your account",
  signInPrompt: "Sign in to manage your access.",
  accessActiveHeading: "Access active",
  freePlanMessage: `You're on the free plan (${PRICING.freeIdeaCount} ideas).`,
  ideasLinkLabel: "Go to the ideas",
} as const;

export const PROOF_BAR = {
  ariaLabel: "Platform statistics",
  postsLabel: "posts read",
  ideasLabel: "ideas published",
  sourcesLabel: "sources",
} as const;

export const LEGAL_PAGE = {
  backToPrefix: "Back to",
  lastUpdatedLabel: "Last updated",
} as const;

export const PRICING_SECTION = {
  eyebrow: "Pricing",
  title: "One plan. Cancel whenever.",
  free: {
    name: "Free",
    price: "R$0",
    items: [
      "5 ideas, chosen by us",
      "Full detail on those 5",
      "No account required",
    ],
  },
  paid: {
    name: "Full access",
    items: [
      "Every idea published so far",
      "Every idea published while your access is active",
      "Source links on every idea",
      "New ideas every month",
    ],
  },
  terms: [
    "Renews annually until you cancel.",
    "Cancel any time — access continues to the end of the paid period.",
    "Card payments only.",
    "7-day refund on your first purchase.",
  ],
} as const;

export const FAQ = {
  eyebrow: "Questions",
  title: "Before you buy.",
  items: [
    {
      q: "How often do new ideas appear?",
      a: "New ideas are added every month. We scan sources every week, but we only publish once we have enough signal to score an idea properly.",
    },
    {
      q: "What happens when my access expires?",
      a: "You go back to the 5 free ideas. Nothing is deleted, and resubscribing restores everything immediately.",
    },
    {
      q: "Can I cancel?",
      a: "Yes, any time. Your access continues until the end of the period you already paid for.",
    },
    {
      q: "Do you offer refunds?",
      a: "Yes — 7 days on your first purchase, no questions asked.",
    },
    {
      q: "Are ideas exclusive to me?",
      a: "No. Every subscriber sees the same ideas. What you're paying for is the evidence, not exclusivity.",
    },
    {
      q: "Where do the ideas come from?",
      a: "Public posts on Reddit, Hacker News, and Product Hunt. Every idea links back to the posts it came from.",
    },
    {
      q: "Do you validate the ideas yourselves?",
      a: "No. We measure what people are asking for. We don't judge whether a business will work — that part is yours.",
    },
  ],
} as const;

export const FINAL_CTA = {
  title: "Stop guessing. Go read what people are asking for.",
  body: "5 ideas are free. No account needed to look around.",
  cta: "Browse the ideas",
  href: "/ideas",
} as const;

export const NAV = {
  links: [
    { label: "How it works", href: "/#how-it-works" },
    { label: "Pricing", href: "/#pricing" },
    { label: "FAQ", href: "/#faq" },
  ],
  cta: { label: "Browse ideas", href: "/ideas" },
} as const;

export const FOOTER = {
  columns: [
    {
      heading: "Product",
      links: [
        { label: "Ideas", href: "/ideas" },
        { label: "How it works", href: "/#how-it-works" },
        { label: "Pricing", href: "/#pricing" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Terms of Service", href: "/terms" },
        { label: "Privacy Policy", href: "/privacy" },
      ],
    },
    {
      heading: "Contact",
      links: [{ label: COMPANY.email, href: `mailto:${COMPANY.email}` }],
    },
  ],
} as const;

// --- Illustrative data for the hero animation ---
// These are plausible paraphrases, NOT quotations of specific real posts.

export type SampleIdea = {
  title: string;
  score: number;
  asks: number;
  mrr: string;
  evidence: string;
};

export const SAMPLE_IDEAS: readonly SampleIdea[] = [
  {
    title: "Invoice autopilot",
    score: 94,
    asks: 47,
    mrr: "$2–6k",
    evidence: "Six tools tried, none of them just send the invoice.",
  },
  {
    title: "Handoff notes",
    score: 88,
    asks: 31,
    mrr: "$1–4k",
    evidence: "Context disappears every time someone leaves the team.",
  },
] as const;

export const SAMPLE_POSTS: readonly string[] = [
  "why is there no tool that just emails the invoice?",
  "I'd pay monthly for this, does it exist?",
  "tried six apps, none do the one thing I need",
  "we gave up and built a spreadsheet instead",
  "I keep doing this manually every week",
  "surely this exists already? I can't find it",
  "context is lost every time someone leaves",
  "onboarding a new dev takes three weeks",
  "our wiki is a graveyard",
] as const;
