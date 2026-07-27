// Single source of truth for marketing and legal copy.
//
// Copy rules enforced by lib/content.test.ts:
//   - no banned marketing adjectives or invented social proof
//   - exactly three sources (Hacker News, GitHub, Stack Exchange)
//   - price is stated in USD and must equal PRICE_CENTS; never quote BRL
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

// `amount` is the price the copy promises and MUST match PRICE_CENTS in
// lib/payments/provider.ts, which is what the purchase row records. content.test.ts
// pins the two together so they cannot drift.
export const PRICING = {
  amount: "$20",
  paymentModel: "one-time payment",
  freeIdeaCount: 5,
  refundDays: 7,
} as const;

export const SOURCES = [
  { name: "Hacker News", color: "#ff6600" },
  { name: "GitHub", color: "#8957e5" },
  { name: "Stack Exchange", color: "#0a95ff" },
] as const;

export const HERO = {
  eyebrow: "Found in public. Ready to build.",
  headline: "People are begging for products that don't exist.",
  subhead:
    "We read thousands of posts on Hacker News, GitHub, and Stack Exchange and pull out the ones where people describe a product they'd pay for — with links to every post. Nobody's built these yet. That's the whole point.",
  primaryCta: "Show me the ideas",
  primaryHref: "/ideas",
  secondaryCta: `See what ${PRICING.amount} buys`,
  secondaryHref: "/#what-you-get",
} as const;

export type SpecimenEvidence = {
  quote: string;
  source: (typeof SOURCES)[number]["name"];
};

// Stat vocabulary shared by the landing specimen, the real idea cards, and the
// idea detail stat band. The landing page promises every published entry
// carries the same receipts as the example — sharing the labels keeps the
// promise and the product from drifting apart.
export const IDEA_LABELS = {
  score: "Demand",
  asks: "Asks",
  mrr: "Est. MRR",
  sources: "Sources",
  competition: "What exists today",
} as const;

// Illustrative, NOT a real published entry — the same standard as SAMPLE_IDEAS
// below. `exampleTag` renders on the card, and evidence rows deliberately carry
// no href. See docs/superpowers/specs/2026-07-20-landing-page-rework-design.md,
// "Content integrity". Enforced by lib/content.test.ts.
export const SPECIMEN = {
  eyebrow: "What you get",
  sectionTitle: "This is what you're buying.",
  intro:
    "One entry, in full. Every published idea carries the same receipts — the score, the numbers, and the posts behind them — so you can judge it like you found it yourself.",
  exampleTag: "Example entry",
  evidenceHeading: "What people actually said",
  labels: IDEA_LABELS,
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
      body: "0–100, from how many people asked and how loudly. A 94 means it came up constantly, in frustrated language. Frustration is demand.",
    },
    {
      n: "02",
      key: "numbers",
      title: "The numbers",
      body: "Asks are distinct posts, not upvotes. The revenue figure is a range built from comparable products — a range, because that's what it honestly is.",
    },
    {
      n: "03",
      key: "receipts",
      title: "The receipts",
      body: "Every claim traces to a post. On a published entry these are live links — go read the demand yourself before you spend a weekend on it.",
    },
    {
      n: "04",
      key: "catch",
      title: "The catch",
      body: "What already exists, and exactly where it falls short of what people asked for. That gap is your way in.",
    },
  ],
} as const;

export const WHY_EVIDENCE = {
  eyebrow: "Why this beats guessing",
  title: "Why not just ask an AI for fifty ideas?",
  intro: "You can. You'll get fifty plausible sentences and zero proof anyone will pay. Here's the difference.",
  rows: [
    { generated: "Plausible-sounding ideas invented on demand", ours: "Ideas pulled from posts real people wrote" },
    { generated: "No way to tell if anyone wants it", ours: "Ask counts from named sources" },
    { generated: "Confident revenue guesses", ours: "Ranges derived from comparable products, shown as ranges" },
    { generated: "Unfalsifiable", ours: "Every claim links to the post behind it" },
  ],
  generatedLabel: "Generated idea lists",
  oursLabel: "NextBigIdea",
} as const;

export const PAYWALL_CTA = {
  headlinePrefix: "Every idea, one payment",
  subtext:
    "Pay once and it's all open — every idea published so far, and every one we publish after. No second charge, ever.",
  ctaAuthenticated: "Unlock everything",
  ctaSignedOut: "Sign in to unlock",
  pendingMessage:
    "A checkout you started recently is still processing. Give it a minute, then reload this page.",
  errorMessage: "Something went wrong starting checkout. Please try again.",
} as const;

export const IDEAS_PAGE = {
  eyebrow: "The catalog",
  title: "Ideas people are asking for",
  subhead: "Pulled from Hacker News, GitHub, and Stack Exchange. Every one scored and sourced. New ideas every month.",
  // Rendered as "{n} ideas published" in the page header.
  countSuffix: "ideas published",
  // Chip on cards for the free-sample entries.
  freeTag: "Free sample",
  // Rendered as "{n} more ideas are locked" above the paywall CTA. A count is
  // the ONLY thing the locked section may reveal — never titles or niches.
  lockedCountSuffix: "more ideas are locked",
} as const;

export const IDEA_DETAIL = {
  lockedMessage:
    "This idea is locked. One payment opens the demand evidence, sources, MRR estimate, and validation signals — here, and on every other idea, including the ones we haven't published yet.",
  opportunityHeading: "The opportunity",
  mrrHeading: "MRR estimate",
  mrrBody:
    "is a conservative, directional range — not a forecast. It is derived from audience-size signals in the source posts, a plausible price point for this niche, and a low assumed conversion rate. Treat it as a heuristic for prioritizing ideas, not a prediction of actual revenue.",
  competitionHeading: "Competition",
  validationHeading: "Validation signals",
  sourcesHeading: "Sources",
} as const;

export const LOGIN = {
  headline: "See who's asking, and what they're asking for.",
  bullets: [
    {
      title: "The original posts",
      body: "Real people, real complaints — who asked, and how many.",
    },
    {
      title: "A conservative MRR estimate",
      body: "With the methodology shown, not a number pulled from air.",
    },
    {
      title: "Everything published, plus what comes next",
      body: "One payment covers every idea live today and every idea we add after.",
    },
  ],
  offer: `Full access · ${PRICING.amount} · ${PRICING.paymentModel}`,
  welcomeHeading: "Welcome",
  welcomeLede: "Continue with your Google account to open the full database.",
  cta: "Continue with Google",
  reassurance:
    "We only use this to sign you in — no posting to your account, no email spam.",
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
  title: `${PRICING.amount}. Once. Everything.`,
  free: {
    name: "Free",
    price: "$0",
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
      "Every idea published after — included",
      "Source links on every idea",
      "New ideas every month",
    ],
  },
  terms: [
    "One-time payment — nothing recurs, nothing to cancel.",
    "Card payments only.",
    "7-day refund, no questions asked.",
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
      q: "Does my access expire?",
      a: "No. You pay once, and everything published today plus every idea added after stays open to you.",
    },
    {
      q: "Do I pay again next year?",
      a: "No. You pay a single time. There is nothing to cancel and no second charge coming.",
    },
    {
      q: "Do you offer refunds?",
      a: "Yes — 7 days, no questions asked.",
    },
    {
      q: "Are ideas exclusive to me?",
      a: "No. Everyone who pays sees the same list. You're paying for the evidence, not exclusivity — the edge is in moving first.",
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
  title: "The demand is already out there. It's just sitting in other people's posts.",
  body: "5 ideas are free. No account, no card — go look.",
  cta: "Show me the ideas",
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

// Consumed by app/layout.tsx. Lives here — not in the layout — so the
// content.test.ts corpus rules (banned words, unlicensed sources) cover the
// site metadata too; Reddit/Product Hunt once survived in the layout because
// metadata strings sat outside this module.
export const METADATA = {
  titleDefault: `${COMPANY.name} — Products people are already asking for`,
  titleTemplate: `%s · ${COMPANY.name}`,
  description:
    "We read public posts on Hacker News, GitHub, and Stack Exchange for people describing products that don't exist yet — then score the demand and link every idea back to the posts that prove it.",
  socialTitle: "Products people are already asking for",
  socialDescription:
    "Scored, sourced demand signals from Hacker News, GitHub, and Stack Exchange. Every idea links back to the posts behind it.",
  ogImageAlt: `${COMPANY.name} — scored SaaS ideas with links to the posts that prove demand`,
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
