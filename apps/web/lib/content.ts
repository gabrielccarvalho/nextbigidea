// Single source of truth for marketing and legal copy.
//
// Copy rules enforced by lib/content.test.ts:
//   - no banned marketing adjectives or invented social proof
//   - exactly three sources (Hacker News, GitHub, Stack Exchange)
//   - price is stated in BRL; USD only ever as a parenthetical
//   - we scan weekly, we publish monthly — never "new ideas weekly"

export const COMPANY = {
  name: "NextBigIdea",
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
  { name: "Hacker News", color: "#ff6600" },
  { name: "GitHub", color: "#8957e5" },
  { name: "Stack Exchange", color: "#0a95ff" },
] as const;

export const HERO = {
  eyebrow: "Evidence, not brainstorms",
  headline: "Every idea here has someone asking for it.",
  subhead:
    "Every week we read public posts across Hacker News, GitHub, and Stack Exchange looking for people describing a product that doesn't exist yet — then score the strongest signals and link each one back to the posts that prove it. Nobody's built them yet.",
  primaryCta: "Browse the ideas",
  primaryHref: "/ideas",
  secondaryCta: "See what you get",
  secondaryHref: "/#what-you-get",
} as const;

export type SpecimenEvidence = {
  quote: string;
  source: (typeof SOURCES)[number]["name"];
};

// Illustrative, NOT a real published entry — the same standard as SAMPLE_IDEAS
// below. `exampleTag` renders on the card, and evidence rows deliberately carry
// no href. See docs/superpowers/specs/2026-07-20-landing-page-rework-design.md,
// "Content integrity". Enforced by lib/content.test.ts.
export const SPECIMEN = {
  eyebrow: "What you get",
  sectionTitle: "This is one of them.",
  intro:
    "One entry, in full. Every published idea carries the same evidence, so you can judge it the way you'd judge your own research.",
  exampleTag: "Example entry",
  evidenceHeading: "What people actually said",
  labels: {
    score: "Demand",
    asks: "Asks",
    mrr: "Est. MRR",
    sources: "Sources",
    competition: "What exists today",
  },
  idea: {
    niche: "Finance ops",
    title: "Invoice autopilot",
    oneLiner:
      "Watches your billing inbox and sends the invoice without being asked twice.",
    demandScore: 94,
    asks: 47,
    mrrRange: "$2–6k",
    competition:
      "Three tools do this inside a larger billing suite. None of them do it on its own, and each one expects you to move your whole invoicing workflow across first.",
    evidence: [
      { quote: "Six tools tried, none of them just send the invoice.", source: "GitHub" },
      { quote: "I'd pay for something that does only this.", source: "Hacker News" },
      { quote: "Every billing tool wants to be an ERP.", source: "Stack Exchange" },
    ] as readonly SpecimenEvidence[],
  },
} as const;

// The four passages that scroll past the pinned specimen. `key` maps to the
// region of the card that highlights while the passage is active — the values
// must stay in sync with the SpecimenRegion type in components/specimen-card.tsx.
export const DISSECTION = {
  steps: [
    {
      n: "01",
      key: "score",
      title: "The score",
      body: "0–100, from how many people asked and how strongly they asked. A 94 means this one came up constantly, in frustrated language.",
    },
    {
      n: "02",
      key: "numbers",
      title: "The numbers",
      body: "Ask count is distinct posts, not upvotes. The revenue figure is a range derived from comparable products — a range, because that is what it honestly is.",
    },
    {
      n: "03",
      key: "receipts",
      title: "The receipts",
      body: "Every claim traces to a post. On a published entry these are live links you can go read yourself.",
    },
    {
      n: "04",
      key: "catch",
      title: "The catch",
      body: "What already exists, and where it falls short of what people asked for.",
    },
  ],
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
  oursLabel: "NextBigIdea",
} as const;

export const PAYWALL_CTA = {
  headlinePrefix: "Unlock every idea",
  subtext: "Card payment, renews annually. Cancel any time — access runs to the end of your paid period.",
  ctaAuthenticated: "Unlock now",
  ctaSignedOut: "Sign in to unlock",
} as const;

export const IDEAS_PAGE = {
  title: "SaaS demand ideas",
  subhead: "Sourced from Hacker News, GitHub, and Stack Exchange. New ideas every month.",
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

export const LOGIN = {
  headline: "Sign in to see every idea backed by real demand.",
  bullets: [
    {
      title: "The original posts",
      body: "Who asked for it, and how many people did.",
    },
    {
      title: "A conservative MRR estimate",
      body: "With the methodology shown, not a number pulled from air.",
    },
    {
      title: "Everything published, plus weekly drops",
      body: "Every idea live today and each new one while you're subscribed.",
    },
  ],
  offer: `Full access · ${PRICING.amountBRL}/${PRICING.term} · cancel anytime`,
  welcomeHeading: "Welcome",
  welcomeLede: "Continue with your Google account to unlock the full database.",
  cta: "Continue with Google",
  reassurance:
    "We only use this to sign you in — no posting to your account, no email spam.",
} as const;

export const ACCOUNT_PAGE = {
  title: "Your account",
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
      a: "Public posts on Hacker News, GitHub, and Stack Exchange. Every idea links back to the posts it came from.",
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
    { label: "What you get", href: "/#what-you-get" },
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
        { label: "What you get", href: "/#what-you-get" },
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
  "we hacked something together in a weekend and still use it",
  "every tool does ten things, I need one",
  "is there a simple version of this that just works?",
] as const;
