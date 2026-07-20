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

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // abacatepay
  providerChargeId: text("provider_charge_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("BRL"),
  status: text("status").notNull().default("pending"), // pending | paid | refunded
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const session = pgTable("session", {
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
});

export const account = pgTable("account", {
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
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
