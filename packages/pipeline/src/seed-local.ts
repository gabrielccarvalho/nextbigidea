import "dotenv/config";
import { runPipeline } from "./run";

/**
 * Local cron runner: executes the REAL `runPipeline()` — same adapters, same normalize/dedupe/
 * relevance/cluster/enrich stages, same DB writes, same spend-cap bookkeeping and pipeline_runs
 * row — with only the network boundary faked.
 *
 * Two things are intercepted at `globalThis.fetch`, and nothing else:
 *   1. Reddit / HN source APIs  -> deterministic fixtures in the providers' real response shapes,
 *      so the adapters' genuine parsers (parseRedditListing / parseHnHits) do the work.
 *   2. api.openai.com           -> a deterministic stand-in for the model, so a run costs $0.
 *
 * Everything downstream of those two boundaries is production code. Run with:
 *   pnpm --filter @workspace/pipeline seed:local
 */

// --- Fixture corpus -------------------------------------------------------------------------
// Post text must contain a phrase matching keywordPrefilter's SIGNAL_PATTERNS in relevance.ts,
// otherwise the post is dropped before the classifier ever sees it.

type Topic = "onboarding" | "podcast" | "inventory" | "compliance";

interface SeedPost {
  id: string;
  topic: Topic;
  title: string;
  body: string;
  author: string;
  ups: number;
  comments: number;
}

const REDDIT_POSTS: Record<string, SeedPost[]> = {
  SaaS: [
    {
      id: "r_onb1",
      topic: "onboarding",
      title: "Is there a tool that automates client onboarding for agencies?",
      body: "Every new client means the same 30 manual steps: contract, invoice, Slack channel, Drive folder, kickoff form. Is there a tool that chains these together? I would pay for this tomorrow.",
      author: "agencyops",
      ups: 412,
      comments: 87,
    },
    {
      id: "r_cmp1",
      topic: "compliance",
      title: "SOC 2 evidence collection is eating my quarter",
      body: "I wish there was a way to auto-collect screenshots and access logs for SOC 2 audits. Our auditor wants 200 artifacts and we gather them by hand every single time.",
      author: "ctofintech",
      ups: 298,
      comments: 64,
    },
  ],
  smallbusiness: [
    {
      id: "r_inv1",
      topic: "inventory",
      title: "Looking for a tool to forecast Shopify inventory",
      body: "Looking for a tool that predicts which SKUs will stock out based on velocity and seasonality. Everything I find is enterprise priced. I'd pay good money for something under $100/mo.",
      author: "dtcfounder",
      ups: 351,
      comments: 73,
    },
    {
      id: "r_onb2",
      topic: "onboarding",
      title: "Someone should build a client portal that isn't awful",
      body: "Someone should build a proper onboarding portal for service businesses. Clients get lost in email threads and we lose two days per engagement chasing documents.",
      author: "consultninja",
      ups: 187,
      comments: 41,
    },
  ],
  Entrepreneur: [
    {
      id: "r_pod1",
      topic: "podcast",
      title: "Is there an app that turns podcasts into short clips automatically?",
      body: "Is there an app that finds the best 60 seconds of a 2 hour podcast and cuts vertical clips? I pay an editor $800/mo just for this and would happily pay for software instead.",
      author: "showrunner",
      ups: 524,
      comments: 118,
    },
    {
      id: "r_cmp2",
      topic: "compliance",
      title: "Does anybody know of a cheaper Vanta alternative?",
      body: "Does anyone know of a tool that handles compliance evidence without the $25k/yr price tag? We're a 6 person team and need SOC 2 for one enterprise deal.",
      author: "seedstage",
      ups: 233,
      comments: 55,
    },
  ],
  startups: [
    {
      id: "r_inv2",
      topic: "inventory",
      title: "There is no good demand forecasting tool for small ecommerce",
      body: "There's no decent tool for demand forecasting under enterprise pricing. We over-order every quarter and it ties up all our cash.",
      author: "opslead",
      ups: 176,
      comments: 38,
    },
    {
      id: "r_pod2",
      topic: "podcast",
      title: "I wish there was a way to repurpose video into every format",
      body: "I wish there was software that takes one long video and produces shorts, a newsletter draft, and timestamps. Doing it manually costs me a full day per episode.",
      author: "creatorops",
      ups: 445,
      comments: 96,
    },
  ],
};

const HN_POSTS: SeedPost[] = [
  {
    id: "hn_onb1",
    topic: "onboarding",
    title: "Ask HN: Is there a tool for automating professional services onboarding?",
    body: "Is there a tool that turns a signed contract into a provisioned workspace? We rebuild the same checklist for every client and it is pure toil.",
    author: "hnfounder",
    ups: 214,
    comments: 82,
  },
  {
    id: "hn_pod1",
    topic: "podcast",
    title: "Ask HN: Best tool to auto-generate clips from long form video?",
    body: "Any tool recommendations for automatic clip extraction from long form video? I would pay for something that handles speaker detection and captions.",
    author: "videohacker",
    ups: 389,
    comments: 141,
  },
  {
    id: "hn_cmp1",
    topic: "compliance",
    title: "Ask HN: How are small teams handling SOC 2 evidence?",
    body: "I need a tool that continuously collects compliance evidence instead of a once-a-year fire drill. Everything on the market targets 200+ person companies.",
    author: "securitylead",
    ups: 267,
    comments: 93,
  },
];

// One theme per topic — what a real clustering pass would converge on.
const THEME_TITLES: Record<Topic, string> = {
  onboarding: "Automated client onboarding for agencies",
  podcast: "Automatic clip extraction from long-form video",
  inventory: "Demand forecasting for small ecommerce",
  compliance: "Continuous SOC 2 evidence collection",
};

const IDEAS: Record<Topic, Record<string, unknown>> = {
  onboarding: {
    title: "Automated client onboarding for agencies",
    oneLiner: "Turn a signed contract into a fully provisioned client workspace in one click.",
    description:
      "Agencies and service businesses repeat the same 20-30 manual steps for every new client: contract countersign, invoice, Slack channel, shared drive, kickoff questionnaire, project board. This product watches for a signed contract and provisions the whole stack automatically, then walks the client through a branded intake portal so documents stop living in email threads.",
    niche: "agencies and professional services",
    keywords: "client onboarding automation agency portal provisioning intake workflow",
    demandScore: 84,
    mrrLow: 4000,
    mrrHigh: 18000,
    competitionNotes:
      "Adjacent tools (Dubsado, HoneyBook) target solo freelancers and stop at proposals; Zapier can wire pieces together but needs an operator to build and maintain it. No incumbent owns contract-to-provisioned-workspace for 5-50 person agencies.",
    validationSignals: [
      "Multiple posts describe the identical 30-step manual checklist",
      "Explicit willingness to pay stated unprompted",
      "Complaints span agencies, consultancies and service businesses",
    ],
  },
  podcast: {
    title: "Automatic clip extraction from long-form video",
    oneLiner: "Find the best 60 seconds of any long video and ship captioned vertical clips.",
    description:
      "Creators pay editors hundreds per month to hunt for highlights in two-hour recordings. This product ingests a long-form episode, scores segments for standalone punchiness, and renders captioned vertical cuts with speaker framing — plus timestamps and a newsletter draft from the same transcript.",
    niche: "podcasters and video creators",
    keywords: "podcast video clips repurposing shorts captions transcript highlights",
    demandScore: 91,
    mrrLow: 6000,
    mrrHigh: 30000,
    competitionNotes:
      "Opus Clip and Vizard exist and validate the category, but posts consistently complain about highlight selection quality and rigid templates. Differentiation is selection accuracy and multi-format output, not the existence of clipping itself.",
    validationSignals: [
      "One poster reports paying an editor $800/mo for exactly this task",
      "Highest engagement of any theme in the sample",
      "Demand appears independently on both Reddit and Hacker News",
    ],
  },
  inventory: {
    title: "Demand forecasting for small ecommerce",
    oneLiner: "Tell Shopify sellers which SKUs will stock out before cash is already tied up.",
    description:
      "Small DTC brands over-order and strand working capital because forecasting tools are priced for enterprise. This product connects to Shopify, models velocity and seasonality per SKU, and produces reorder recommendations with stockout dates and a cash-impact estimate.",
    niche: "Shopify and DTC ecommerce operators",
    keywords: "inventory forecasting shopify ecommerce stockout demand planning reorder",
    demandScore: 78,
    mrrLow: 3000,
    mrrHigh: 14000,
    competitionNotes:
      "Inventory Planner and Cogsy sit at the top of the market; repeated complaints centre on enterprise pricing rather than missing capability. A sub-$100/mo tier is the stated gap.",
    validationSignals: [
      "Explicit price anchor: under $100/mo named by a poster",
      "Cash-flow pain described concretely, not hypothetically",
      "Same complaint from both r/smallbusiness and r/startups",
    ],
  },
  compliance: {
    title: "Continuous SOC 2 evidence collection",
    oneLiner: "Collect audit evidence continuously so SOC 2 stops being a quarterly fire drill.",
    description:
      "Small teams chasing their first enterprise deal need SOC 2 but face $25k/yr platforms built for 200-person companies. This product connects to cloud and SaaS accounts, continuously captures the access logs and configuration artifacts auditors request, and assembles the evidence package on demand.",
    niche: "seed-stage B2B SaaS teams",
    keywords: "soc2 compliance evidence audit security automation vanta alternative",
    demandScore: 81,
    mrrLow: 5000,
    mrrHigh: 22000,
    competitionNotes:
      "Vanta and Drata dominate but are priced out of reach for 6-person teams; posts explicitly ask for a cheaper alternative rather than a different feature set. Price-tier disruption in a category with proven willingness to pay.",
    validationSignals: [
      "A specific competitor price point ($25k/yr) named as the blocker",
      "Driven by a concrete enterprise deal requirement",
      "Auditor artifact counts described from direct experience",
    ],
  },
};

// --- Response shaping -----------------------------------------------------------------------

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function redditListing(subreddit: string) {
  const posts = REDDIT_POSTS[subreddit] ?? [];
  return {
    data: {
      children: posts.map((p) => ({
        data: {
          id: p.id,
          title: p.title,
          selftext: p.body,
          permalink: `/r/${subreddit}/comments/${p.id}/`,
          author: p.author,
          created_utc: Math.floor(Date.now() / 1000) - 86_400,
          ups: p.ups,
          num_comments: p.comments,
        },
      })),
    },
  };
}

function hnSearch() {
  return {
    hits: HN_POSTS.map((p) => ({
      objectID: p.id,
      title: p.title,
      story_text: p.body,
      author: p.author,
      points: p.ups,
      num_comments: p.comments,
      created_at_i: Math.floor(Date.now() / 1000) - 86_400,
    })),
  };
}

const ALL_POSTS: SeedPost[] = [...Object.values(REDDIT_POSTS).flat(), ...HN_POSTS];
const topicById = new Map(ALL_POSTS.map((p) => [p.id, p.topic]));

/**
 * A valid OpenAI Responses envelope wrapping `value`.
 *
 * Two details the SDK actually depends on:
 *   - `output_text` is NOT read from the payload. The SDK derives it by walking `output[]`
 *     for a `message` whose `content[]` holds an `output_text` block (see
 *     openai/lib/ResponsesParser.js `addOutputText`). Flattening this envelope would yield
 *     an empty string from every stage rather than an error.
 *   - Every call goes through Structured Outputs, and OpenAiClient.complete() unwraps the
 *     `{ result: ... }` envelope it wraps schemas in — so the fixture body must be wrapped
 *     the same way or the unwrap yields undefined.
 */
function openAiResponse(value: unknown) {
  return {
    id: "resp_seed",
    object: "response",
    model: "seed-local",
    status: "completed",
    output: [
      {
        id: "msg_seed",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify({ result: value }), annotations: [] }],
      },
    ],
    // Reported as zero so the run records $0 spend against the monthly cap — the fixture run
    // must not consume budget that a later real run is entitled to.
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}

/**
 * Stands in for Haiku. Dispatches on the prompt each stage sends, and answers from the fixture
 * corpus so the run is fully deterministic.
 */
function mockOpenAi(init?: RequestInit) {
  // The Responses API takes one `input` string. Under the old Anthropic client the
  // classifier's instruction arrived in a separate top-level `system` field, so dispatching
  // on `system` used to work; it no longer exists, and matching on `input` is what keeps the
  // classify branch reachable.
  const body = JSON.parse(String(init?.body ?? "{}")) as { input?: string };
  const content = body.input ?? "";

  // relevance.ts -> classifyDemand: every fixture post is genuine demand, so all indices match.
  if (content.includes("You classify social posts")) {
    const count = content.split(/\n\n/).filter((s) => /^\[\d+\]/.test(s)).length;
    return openAiResponse(Array.from({ length: count }, (_, i) => i));
  }

  // cluster.ts -> group the listing into one theme per topic.
  if (content.startsWith("Group these posts into distinct product-demand themes")) {
    const byTopic = new Map<Topic, string[]>();
    for (const line of content.split("\n")) {
      const key = line.match(/^(\w+:[\w_]+) =>/)?.[1];
      if (!key) continue;
      const topic = topicById.get(key.split(":")[1]!);
      if (!topic) continue;
      byTopic.set(topic, [...(byTopic.get(topic) ?? []), key]);
    }
    const themes = [...byTopic.entries()].map(([topic, postKeys]) => ({
      title: THEME_TITLES[topic],
      postKeys,
    }));
    return openAiResponse(themes);
  }

  // enrich.ts -> return the authored idea for the theme named in the prompt.
  const themeTitle = content.match(/demand posts about "([^"]+)"/)?.[1];
  const topic = (Object.keys(THEME_TITLES) as Topic[]).find((t) => THEME_TITLES[t] === themeTitle);
  if (topic) return openAiResponse(IDEAS[topic]);

  throw new Error(`seed-local: unhandled OpenAI prompt: ${content.slice(0, 120)}`);
}

// --- Network interception -------------------------------------------------------------------

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (url.includes("hn.algolia.com")) return jsonResponse(hnSearch());
  if (url.includes("reddit.com")) {
    const sub = url.match(/\/r\/([^/]+)\//)?.[1] ?? "";
    return jsonResponse(redditListing(sub));
  }
  if (url.includes("api.openai.com")) return jsonResponse(mockOpenAi(init));

  // Anything else (including the Neon proxies, which use their own transport) passes through.
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;

// --- Run ------------------------------------------------------------------------------------

process.env.SOURCE_REDDIT = "true";
process.env.SOURCE_HACKERNEWS = "true";
process.env.SOURCE_PRODUCTHUNT = "false";
process.env.SOURCE_X = "false";
process.env.SOURCE_LINKEDIN = "false";
// Off: their live APIs are not intercepted above, and a $0 deterministic run
// must never touch the network.
process.env.SOURCE_STACKEXCHANGE = "false";
process.env.SOURCE_GITHUB = "false";
process.env.OPENAI_API_KEY ??= "sk-seed-local-not-a-real-key";

const report = await runPipeline();
console.log(JSON.stringify(report.toStats(), null, 2));
