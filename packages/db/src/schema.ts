import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Pipeline ---

export const pipelineRuns = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"), // running | success | partial | failed
  stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
  // Spend for this run, in millicents (1 millicent = 1e-5 USD). Integer to avoid float drift.
  estimatedMillicents: integer("estimated_millicents").notNull().default(0),
});

export const rawPosts = pgTable(
  "raw_posts",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(), // reddit | hackernews | producthunt | x | linkedin
    sourcePostId: text("source_post_id").notNull(),
    url: text("url").notNull(),
    author: text("author"),
    title: text("title"),
    content: text("content").notNull().default(""),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
    runId: integer("run_id").references(() => pipelineRuns.id),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("raw_posts_source_uq").on(t.source, t.sourcePostId)],
);

export const ideas = pgTable(
  "ideas",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    oneLiner: text("one_liner").notNull(),
    description: text("description").notNull(),
    niche: text("niche").notNull(),
    keywords: text("keywords").notNull().default(""), // space-joined, for pg_trgm matching
    demandScore: integer("demand_score").notNull().default(0), // 0-100
    mrrLow: integer("mrr_low").notNull().default(0), // whole USD
    mrrHigh: integer("mrr_high").notNull().default(0),
    competitionNotes: text("competition_notes").notNull().default(""),
    validationSignals: jsonb("validation_signals").$type<string[]>().notNull().default([]),
    askCount: integer("ask_count").notNull().default(0),
    status: text("status").notNull().default("draft"), // draft | published
    isFree: boolean("is_free").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("ideas_slug_uq").on(t.slug),
    index("ideas_status_idx").on(t.status),
  ],
);

export const ideaEvidence = pgTable(
  "idea_evidence",
  {
    id: serial("id").primaryKey(),
    ideaId: integer("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    rawPostId: integer("raw_post_id")
      .notNull()
      .references(() => rawPosts.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("demand"), // demand | validation
  },
  (t) => [uniqueIndex("idea_evidence_uq").on(t.ideaId, t.rawPostId)],
);

// --- Payments ---

export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // "stripe" for every row written since the Stripe migration; "abacatepay" on
    // historical rows, which are deliberately left untouched — they record what the
    // customer was actually charged at the time, in the currency they paid.
    provider: text("provider").notNull(),
    // Stripe Checkout Session id (cs_...). Written by the checkout route before any money
    // moves, and the id `checkout.session.completed` carries back.
    providerChargeId: text("provider_charge_id").notNull(),
    // Stripe PaymentIntent id (pi_...). Captured when the payment lands, because it is the
    // ONLY identifier a later refund or dispute shares with the original payment: those
    // callbacks describe a Charge, which knows its PaymentIntent but NOT the Checkout
    // Session that created it. Without this column a refund cannot be matched to a row.
    // Nullable: a `pending` row has no PaymentIntent id until the payment succeeds.
    providerPaymentIntentId: text("provider_payment_intent_id"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"), // pending | paid | refunded
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    // --- Legacy AbacatePay subscription columns -------------------------------------------
    // Retained so historical rows keep their meaning; NOTHING writes them any more. The
    // Stripe integration charges once (`mode: "payment"`) and creates no subscription, so
    // there are no renewals to stack a period onto and no cancellations to record. Access is
    // "any row with status = 'paid'" — see lib/viewer-access.ts, which has never read these.
    providerSubscriptionId: text("provider_subscription_id"),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledDueTo: text("cancelled_due_to"),
  },
  // Payment providers RETRY webhooks. Without this constraint, two concurrent
  // deliveries of the same charge can both pass a check-then-insert and write
  // duplicate paid rows. The unique index makes idempotency a database
  // guarantee rather than a race the application hopes to win.
  (t) => [
    uniqueIndex("purchases_provider_charge_uq").on(t.providerChargeId),
    // Refunds and disputes resolve their target through this column, so it is on the hot
    // path for every revocation.
    index("purchases_provider_payment_intent_idx").on(t.providerPaymentIntentId),
    index("purchases_provider_subscription_idx").on(t.providerSubscriptionId),
  ],
);

// --- Better Auth core tables ---
// Field names/types follow Better Auth's expected schema. Do not rename columns.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
