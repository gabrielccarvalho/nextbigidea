# Demand Ideas Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SaaS-demand idea database: a weekly automated pipeline mines Reddit/HN/Product Hunt (plus best-effort X/LinkedIn) for product demand, enriches it with Claude Haiku into scored ideas, and a Next.js web app serves 5 free ideas with the rest behind a $20 AbacatePay lifetime paywall.

**Architecture:** A pnpm/Turborepo monorepo. `packages/db` holds the shared Drizzle schema + Neon client. `packages/pipeline` is a TypeScript CLI run weekly by GitHub Actions: swappable `SourceAdapter`s fetch posts → dedupe → Haiku relevance filter → cluster (pg_trgm match into existing ideas) → Haiku enrichment → drafts. `apps/web` (Next.js on Vercel) reads the DB, gates locked ideas server-side, authenticates with Better Auth, and unlocks lifetime access via an AbacatePay webhook behind a swappable `PaymentProvider` interface.

**Tech Stack:** TypeScript, pnpm workspaces, Turborepo, Drizzle ORM, Neon Postgres, Next.js 16 (App Router, React 19), Better Auth, Resend, Playwright (unofficial scrapers), `@anthropic-ai/sdk` (Haiku), Vitest, GitHub Actions.

## Global Constraints

- **Package manager:** pnpm@10.33.4. Node `>=20`. Never use npm/yarn.
- **Workspace package names:** `@workspace/*` (e.g. `@workspace/db`, `@workspace/pipeline`). Internal deps use `"workspace:*"`.
- **Modified Next.js:** `apps/web` runs a customized Next.js 16.2.6. Per `AGENTS.md`, BEFORE writing or editing any file under `apps/web`, read the relevant guide in `node_modules/next/dist/docs/` (routing, data-fetching, route-handlers, server-actions). APIs may differ from training data. Heed deprecation notices.
- **Model:** All Claude calls use `claude-haiku-4-5` (exact ID). Never a different model without explicit instruction.
- **Cost cap:** the pipeline aborts enrichment before exceeding a configured monthly USD cap (default `PIPELINE_MONTHLY_USD_CAP=5`).
- **Money is stored in cents (integers).** MRR estimates are stored as `mrr_low`/`mrr_high` integer USD (whole dollars). Payment amounts are integer BRL cents.
- **Secrets:** never commit secrets. All secrets come from env vars (`.env` locally, GitHub Actions secrets in CI, Vercel env vars in prod). `.env*` is already gitignored.
- **Free-idea count:** exactly 5 ideas carry `is_free = true` and are the only fully-visible ideas for anonymous/unpaid users.
- **Adapter isolation:** one source adapter throwing must never abort the run or other adapters. Every adapter failure is caught, recorded in the run report, and the run continues.
- **Tests:** Vitest. Adapters are tested against recorded fixtures — no live network calls in CI.

---

## File Structure

**`packages/db`** (new) — shared data layer, imported by both `pipeline` and `web`:
- `package.json`, `tsconfig.json`, `drizzle.config.ts`
- `src/client.ts` — Neon HTTP client + Drizzle instance
- `src/schema.ts` — all tables (pipeline_runs, raw_posts, ideas, idea_evidence, purchases, + Better Auth tables)
- `src/index.ts` — re-exports client, schema, and inferred types
- `src/queries.ts` — shared read queries (list published ideas, get idea by slug, ask-count)

**`packages/pipeline`** (new) — weekly ingestion CLI:
- `package.json`, `tsconfig.json`, `vitest.config.ts`
- `src/types.ts` — `RawPost`, `SourceAdapter`, `EnrichedIdea` types
- `src/config.ts` — env loading, adapter registry, enabled-adapter resolution
- `src/adapters/reddit.ts`, `src/adapters/hackernews.ts`, `src/adapters/producthunt.ts`
- `src/adapters/x.ts`, `src/adapters/linkedin.ts` — Playwright, degradable
- `src/stages/normalize.ts` — dedupe + upsert raw_posts
- `src/stages/relevance.ts` — keyword pre-filter + Haiku classify
- `src/stages/cluster.ts` — pg_trgm match into existing ideas / group new themes
- `src/stages/enrich.ts` — Haiku enrichment + cost tracking
- `src/anthropic.ts` — Haiku client wrapper + token-cost accounting
- `src/run.ts` — orchestrator (fetch → normalize → relevance → cluster → enrich → report)
- `src/report.ts` — `PipelineRunReport` accumulation + GitHub step summary
- `src/cli.ts` — entrypoint (`pnpm --filter @workspace/pipeline start`)
- `test/fixtures/*.json`, `test/*.test.ts`

**`apps/web`** (exists) — additions:
- `lib/db.ts` — re-export `@workspace/db`
- `lib/auth.ts` — Better Auth server instance
- `lib/auth-client.ts` — Better Auth React client
- `lib/access.ts` — `getViewerAccess()` gating helper
- `lib/payments/provider.ts` — `PaymentProvider` interface + types
- `lib/payments/abacatepay.ts` — AbacatePay implementation
- `lib/payments/index.ts` — provider selection
- `app/api/auth/[...all]/route.ts` — Better Auth handler
- `app/api/payments/webhook/route.ts` — AbacatePay webhook
- `app/api/payments/checkout/route.ts` — create checkout
- `app/ideas/page.tsx` — directory
- `app/ideas/[slug]/page.tsx` — detail (server-gated)
- `app/admin/page.tsx`, `app/admin/actions.ts` — draft review/publish
- `app/account/page.tsx` — purchase status
- `app/page.tsx` — landing (replace starter)
- `components/idea-card.tsx`, `components/locked-teaser.tsx`, `components/paywall-cta.tsx`

---

## Task 1: `packages/db` — schema, client, and types

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`
- Create: `packages/db/src/client.ts`, `packages/db/src/schema.ts`, `packages/db/src/index.ts`
- Create: `packages/db/.env.example`

**Interfaces:**
- Produces: `db` (Drizzle instance), and tables `pipelineRuns`, `rawPosts`, `ideas`, `ideaEvidence`, `purchases`, plus Better Auth tables `user`, `session`, `account`, `verification`. Inferred types `Idea = typeof ideas.$inferSelect`, `NewIdea`, `RawPost`, `NewRawPost`, etc. exported from `@workspace/db`.

- [ ] **Step 1: Create the package manifest**

`packages/db/package.json`:
```json
{
  "name": "@workspace/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.4",
    "drizzle-orm": "^0.44.6"
  },
  "devDependencies": {
    "@workspace/typescript-config": "workspace:*",
    "dotenv": "^16.4.7",
    "drizzle-kit": "^0.31.5",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create tsconfig**

`packages/db/tsconfig.json`:
```json
{
  "extends": "@workspace/typescript-config/base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "drizzle.config.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write the schema**

`packages/db/src/schema.ts`:
```ts
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
```

> Note: Better Auth's exact required columns can drift by version. AFTER installing `better-auth` in Task 12, run its schema generator (`npx @better-auth/cli generate`) and reconcile any differences against these four tables, then regenerate the migration. These definitions are the starting point.

- [ ] **Step 4: Write the client**

`packages/db/src/client.ts`:
```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = neon(url);
export const db = drizzle({ client: sql, schema });
export { schema };
```

- [ ] **Step 5: Write the barrel + inferred types**

`packages/db/src/index.ts`:
```ts
export { db, schema } from "./client";
export * from "./schema";

import type {
  ideas,
  rawPosts,
  pipelineRuns,
  ideaEvidence,
  purchases,
} from "./schema";

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
export type RawPost = typeof rawPosts.$inferSelect;
export type NewRawPost = typeof rawPosts.$inferInsert;
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type IdeaEvidence = typeof ideaEvidence.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
```

- [ ] **Step 6: Write drizzle.config.ts and .env.example**

`packages/db/drizzle.config.ts`:
```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

`packages/db/.env.example`:
```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
```

- [ ] **Step 7: Install and typecheck**

Run:
```bash
pnpm install
pnpm --filter @workspace/db typecheck
```
Expected: install succeeds, typecheck passes with no errors.

- [ ] **Step 8: Generate the migration, then add the pg_trgm extension migration**

Run:
```bash
pnpm --filter @workspace/db db:generate
```
Expected: a migration file appears under `packages/db/drizzle/` (e.g. `0000_*.sql`) plus a `meta/` journal.

drizzle-kit does not emit `CREATE EXTENSION` statements, and Task 9 depends on pg_trgm's `similarity()`. Edit the generated `0000_*.sql` migration and add this as its FIRST line, so the extension exists before any query needs it:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```
Do not create a separate loose `.sql` file — it would never run. The statement must live inside the tracked migration.

- [ ] **Step 9: Commit**
```bash
git add packages/db
git commit -m "feat(db): add shared Drizzle schema, Neon client, and types"
```

---

## Task 2: `packages/pipeline` scaffold + adapter interface + config registry

**Files:**
- Create: `packages/pipeline/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/pipeline/src/types.ts`, `packages/pipeline/src/config.ts`
- Test: `packages/pipeline/test/config.test.ts`

**Interfaces:**
- Consumes: `@workspace/db`.
- Produces:
  - `type RawPost` (pipeline-local shape before DB insert): `{ source: string; sourcePostId: string; url: string; author?: string; title?: string; content: string; postedAt?: Date; metrics: Record<string, number> }`
  - `interface SourceAdapter { readonly name: string; enabled(env: PipelineEnv): boolean; fetchPosts(since: Date, env: PipelineEnv): Promise<RawPost[]> }`
  - `type EnrichedIdea = { title: string; oneLiner: string; description: string; niche: string; keywords: string; demandScore: number; mrrLow: number; mrrHigh: number; competitionNotes: string; validationSignals: string[] }`
  - `function loadEnv(): PipelineEnv`
  - `function enabledAdapters(adapters: SourceAdapter[], env: PipelineEnv): SourceAdapter[]` — pure; filters a caller-supplied adapter list against env flags. Callers pass the list, so there is exactly ONE registry (the `ADAPTERS` array in `run.ts`, Task 10) and this stays testable without importing Playwright.

- [ ] **Step 1: Create manifest**

`packages/pipeline/package.json`:
```json
{
  "name": "@workspace/pipeline",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.68.0",
    "@workspace/db": "workspace:*",
    "drizzle-orm": "^0.44.6",
    "playwright": "^1.50.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@workspace/typescript-config": "workspace:*",
    "dotenv": "^16.4.7",
    "tsx": "^4.19.2",
    "typescript": "^5",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: tsconfig + vitest config**

`packages/pipeline/tsconfig.json`:
```json
{
  "extends": "@workspace/typescript-config/base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test"],
  "exclude": ["node_modules"]
}
```

`packages/pipeline/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 3: Write the failing config test**

`packages/pipeline/test/config.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { enabledAdapters } from "../src/config";
import type { PipelineEnv, SourceAdapter } from "../src/types";

function baseEnv(overrides: Partial<PipelineEnv> = {}): PipelineEnv {
  return {
    databaseUrl: "postgres://x",
    anthropicApiKey: "sk-x",
    monthlyUsdCap: 5,
    sources: { reddit: true, hackernews: true, producthunt: false, x: false, linkedin: false },
    redditUserAgent: "test",
    ...overrides,
  };
}

function fake(name: string, enabled: (e: PipelineEnv) => boolean): SourceAdapter {
  return { name, enabled, fetchPosts: async () => [] };
}

const ADAPTERS: SourceAdapter[] = [
  fake("reddit", (e) => e.sources.reddit),
  fake("hackernews", (e) => e.sources.hackernews),
  fake("producthunt", (e) => e.sources.producthunt),
];

describe("enabledAdapters", () => {
  it("returns only adapters whose source flag is true", () => {
    const names = enabledAdapters(ADAPTERS, baseEnv()).map((a) => a.name).sort();
    expect(names).toEqual(["hackernews", "reddit"]);
  });

  it("returns an empty list when all sources are disabled", () => {
    const env = baseEnv({
      sources: { reddit: false, hackernews: false, producthunt: false, x: false, linkedin: false },
    });
    expect(enabledAdapters(ADAPTERS, env)).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test — verify it fails**

Run: `pnpm --filter @workspace/pipeline test`
Expected: FAIL — cannot import `../src/config` (module not found).

- [ ] **Step 5: Write types.ts**

`packages/pipeline/src/types.ts`:
```ts
export interface RawPost {
  source: string;
  sourcePostId: string;
  url: string;
  author?: string;
  title?: string;
  content: string;
  postedAt?: Date;
  metrics: Record<string, number>;
}

export interface EnrichedIdea {
  title: string;
  oneLiner: string;
  description: string;
  niche: string;
  keywords: string;
  demandScore: number; // 0-100
  mrrLow: number; // whole USD
  mrrHigh: number;
  competitionNotes: string;
  validationSignals: string[];
}

export interface PipelineEnv {
  databaseUrl: string;
  anthropicApiKey: string;
  monthlyUsdCap: number;
  sources: {
    reddit: boolean;
    hackernews: boolean;
    producthunt: boolean;
    x: boolean;
    linkedin: boolean;
  };
  redditUserAgent: string;
  productHuntToken?: string;
  xSessionCookie?: string;
  linkedinSessionCookie?: string;
}

export interface SourceAdapter {
  readonly name: string;
  enabled(env: PipelineEnv): boolean;
  fetchPosts(since: Date, env: PipelineEnv): Promise<RawPost[]>;
}
```

- [ ] **Step 6: Write config.ts (registry + env loader)**

`packages/pipeline/src/config.ts`:
```ts
import type { PipelineEnv, SourceAdapter } from "./types";
export type { PipelineEnv } from "./types";

// Pure: filters a caller-supplied adapter list against the env flags.
// The caller owns the list (see the ADAPTERS array in run.ts) so there is
// exactly one registry, and this stays testable without pulling Playwright
// into the import graph. Swapping an unofficial adapter for an official one
// later means editing that one array — nothing here changes.
export function enabledAdapters(adapters: SourceAdapter[], env: PipelineEnv): SourceAdapter[] {
  return adapters.filter((a) => a.enabled(env));
}

export function loadEnv(): PipelineEnv {
  const req = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  const flag = (k: string): boolean => process.env[k] === "true";
  return {
    databaseUrl: req("DATABASE_URL"),
    anthropicApiKey: req("ANTHROPIC_API_KEY"),
    monthlyUsdCap: Number(process.env.PIPELINE_MONTHLY_USD_CAP ?? "5"),
    sources: {
      reddit: flag("SOURCE_REDDIT"),
      hackernews: flag("SOURCE_HACKERNEWS"),
      producthunt: flag("SOURCE_PRODUCTHUNT"),
      x: flag("SOURCE_X"),
      linkedin: flag("SOURCE_LINKEDIN"),
    },
    redditUserAgent: process.env.REDDIT_USER_AGENT ?? "demand-ideas-bot/0.1",
    productHuntToken: process.env.PRODUCTHUNT_TOKEN,
    xSessionCookie: process.env.X_SESSION_COOKIE,
    linkedinSessionCookie: process.env.LINKEDIN_SESSION_COOKIE,
  };
}
```

> `enabledAdapters` takes the adapter list as a parameter rather than owning a module-level registry. That keeps a single source of truth (`ADAPTERS` in `run.ts`, Task 10), keeps this module free of Playwright imports, and makes the function trivially testable with fake adapters.

- [ ] **Step 7: Run the test — verify it passes**

Run: `pnpm --filter @workspace/pipeline test`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**
```bash
git add packages/pipeline
git commit -m "feat(pipeline): scaffold package, SourceAdapter interface, and config registry"
```

---

## Task 3: Reddit adapter

**Files:**
- Create: `packages/pipeline/src/adapters/reddit.ts`
- Test: `packages/pipeline/test/reddit.test.ts`
- Create fixture: `packages/pipeline/test/fixtures/reddit-search.json`

**Interfaces:**
- Consumes: `SourceAdapter`, `RawPost`, `PipelineEnv` from `../src/types`.
- Produces: `export const redditAdapter: SourceAdapter` (name `"reddit"`), and `export function parseRedditListing(json: unknown, subreddit: string): RawPost[]` (pure, testable).

- [ ] **Step 1: Create the fixture**

Save a trimmed real Reddit JSON listing to `packages/pipeline/test/fixtures/reddit-search.json`. It must match Reddit's `/r/{sub}/search.json` shape:
```json
{
  "data": {
    "children": [
      {
        "data": {
          "id": "abc123",
          "title": "I wish there was a tool that auto-generates invoices from Stripe",
          "selftext": "Spending hours every month on this. Would pay for a fix.",
          "permalink": "/r/SaaS/comments/abc123/i_wish/",
          "author": "founder42",
          "created_utc": 1752900000,
          "ups": 87,
          "num_comments": 34
        }
      },
      {
        "data": {
          "id": "def456",
          "title": "Just shipped my weekend project",
          "selftext": "Check it out",
          "permalink": "/r/SaaS/comments/def456/just_shipped/",
          "author": "builder",
          "created_utc": 1752800000,
          "ups": 3,
          "num_comments": 1
        }
      }
    ]
  }
}
```

- [ ] **Step 2: Write the failing test**

`packages/pipeline/test/reddit.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRedditListing } from "../src/adapters/reddit";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures/reddit-search.json"), "utf8"),
);

describe("parseRedditListing", () => {
  it("maps each child to a RawPost with source-prefixed id and full url", () => {
    const posts = parseRedditListing(fixture, "SaaS");
    expect(posts).toHaveLength(2);
    const first = posts[0]!;
    expect(first.source).toBe("reddit");
    expect(first.sourcePostId).toBe("abc123");
    expect(first.url).toBe("https://www.reddit.com/r/SaaS/comments/abc123/i_wish/");
    expect(first.author).toBe("founder42");
    expect(first.title).toContain("auto-generates invoices");
    expect(first.content).toContain("Would pay");
    expect(first.metrics).toEqual({ ups: 87, comments: 34 });
    expect(first.postedAt?.getTime()).toBe(1752900000 * 1000);
  });

  it("returns [] for a malformed listing", () => {
    expect(parseRedditListing({}, "SaaS")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — verify it fails**

Run: `pnpm --filter @workspace/pipeline test reddit`
Expected: FAIL — `parseRedditListing` not exported.

- [ ] **Step 4: Implement the adapter**

`packages/pipeline/src/adapters/reddit.ts`:
```ts
import type { PipelineEnv, RawPost, SourceAdapter } from "../types";

// Subreddits and demand-signal queries. Add/remove freely — swappable config.
const SUBREDDITS = ["SaaS", "smallbusiness", "Entrepreneur", "startups"];
const QUERY = '"i wish there was" OR "is there a tool" OR "looking for a tool"';

interface RedditChild {
  data?: {
    id?: string;
    title?: string;
    selftext?: string;
    permalink?: string;
    author?: string;
    created_utc?: number;
    ups?: number;
    num_comments?: number;
  };
}

export function parseRedditListing(json: unknown, _subreddit: string): RawPost[] {
  const children = (json as { data?: { children?: RedditChild[] } })?.data?.children;
  if (!Array.isArray(children)) return [];
  const out: RawPost[] = [];
  for (const c of children) {
    const d = c.data;
    if (!d?.id || !d.permalink) continue;
    out.push({
      source: "reddit",
      sourcePostId: d.id,
      url: `https://www.reddit.com${d.permalink}`,
      author: d.author,
      title: d.title,
      content: d.selftext ?? "",
      postedAt: d.created_utc ? new Date(d.created_utc * 1000) : undefined,
      metrics: { ups: d.ups ?? 0, comments: d.num_comments ?? 0 },
    });
  }
  return out;
}

export const redditAdapter: SourceAdapter = {
  name: "reddit",
  enabled: (env) => env.sources.reddit,
  async fetchPosts(_since: Date, env: PipelineEnv): Promise<RawPost[]> {
    const all: RawPost[] = [];
    for (const sub of SUBREDDITS) {
      const url =
        `https://www.reddit.com/r/${sub}/search.json` +
        `?q=${encodeURIComponent(QUERY)}&restrict_sr=1&sort=new&limit=100&t=week`;
      const res = await fetch(url, { headers: { "user-agent": env.redditUserAgent } });
      if (!res.ok) throw new Error(`reddit ${sub} HTTP ${res.status}`);
      all.push(...parseRedditListing(await res.json(), sub));
    }
    return all;
  },
};
```

- [ ] **Step 5: Run — verify it passes**

Run: `pnpm --filter @workspace/pipeline test reddit`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**
```bash
git add packages/pipeline/src/adapters/reddit.ts packages/pipeline/test/reddit.test.ts packages/pipeline/test/fixtures/reddit-search.json
git commit -m "feat(pipeline): add Reddit source adapter"
```

---

## Task 4: Hacker News adapter

**Files:**
- Create: `packages/pipeline/src/adapters/hackernews.ts`
- Test: `packages/pipeline/test/hackernews.test.ts`
- Create fixture: `packages/pipeline/test/fixtures/hn-algolia.json`

**Interfaces:**
- Produces: `export const hackerNewsAdapter: SourceAdapter` (name `"hackernews"`), `export function parseHnHits(json: unknown): RawPost[]` (pure).

- [ ] **Step 1: Create the fixture**

`packages/pipeline/test/fixtures/hn-algolia.json` (HN Algolia `/api/v1/search_by_date` shape):
```json
{
  "hits": [
    {
      "objectID": "39000001",
      "title": "Ask HN: Is there a tool to track competitor pricing automatically?",
      "story_text": "I check 12 sites by hand weekly. Would happily pay for automation.",
      "author": "pg_fan",
      "points": 45,
      "num_comments": 20,
      "created_at_i": 1752900500
    },
    {
      "objectID": "39000002",
      "title": "Show HN: My new note app",
      "story_text": null,
      "author": "noteguy",
      "points": 2,
      "num_comments": 0,
      "created_at_i": 1752800500
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`packages/pipeline/test/hackernews.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHnHits } from "../src/adapters/hackernews";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/hn-algolia.json"), "utf8"));

describe("parseHnHits", () => {
  it("maps hits to RawPosts with the HN item url", () => {
    const posts = parseHnHits(fixture);
    expect(posts).toHaveLength(2);
    const first = posts[0]!;
    expect(first.source).toBe("hackernews");
    expect(first.sourcePostId).toBe("39000001");
    expect(first.url).toBe("https://news.ycombinator.com/item?id=39000001");
    expect(first.metrics).toEqual({ points: 45, comments: 20 });
    expect(first.content).toContain("pay for automation");
  });

  it("tolerates null story_text", () => {
    const posts = parseHnHits(fixture);
    expect(posts[1]!.content).toBe("");
  });
});
```

- [ ] **Step 3: Run — verify it fails.** `pnpm --filter @workspace/pipeline test hackernews` → FAIL.

- [ ] **Step 4: Implement**

`packages/pipeline/src/adapters/hackernews.ts`:
```ts
import type { PipelineEnv, RawPost, SourceAdapter } from "../types";

interface HnHit {
  objectID?: string;
  title?: string;
  story_text?: string | null;
  author?: string;
  points?: number;
  num_comments?: number;
  created_at_i?: number;
}

export function parseHnHits(json: unknown): RawPost[] {
  const hits = (json as { hits?: HnHit[] })?.hits;
  if (!Array.isArray(hits)) return [];
  const out: RawPost[] = [];
  for (const h of hits) {
    if (!h.objectID) continue;
    out.push({
      source: "hackernews",
      sourcePostId: h.objectID,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: h.author,
      title: h.title,
      content: h.story_text ?? "",
      postedAt: h.created_at_i ? new Date(h.created_at_i * 1000) : undefined,
      metrics: { points: h.points ?? 0, comments: h.num_comments ?? 0 },
    });
  }
  return out;
}

export const hackerNewsAdapter: SourceAdapter = {
  name: "hackernews",
  enabled: (env) => env.sources.hackernews,
  async fetchPosts(since: Date, _env: PipelineEnv): Promise<RawPost[]> {
    const sinceTs = Math.floor(since.getTime() / 1000);
    const query = encodeURIComponent("ask HN tool");
    const url =
      `https://hn.algolia.com/api/v1/search_by_date` +
      `?query=${query}&tags=ask_hn&numericFilters=created_at_i>${sinceTs}&hitsPerPage=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`hn HTTP ${res.status}`);
    return parseHnHits(await res.json());
  },
};
```

- [ ] **Step 5: Run — verify passes.** Expected: PASS (2 tests).

- [ ] **Step 6: Commit**
```bash
git add packages/pipeline/src/adapters/hackernews.ts packages/pipeline/test/hackernews.test.ts packages/pipeline/test/fixtures/hn-algolia.json
git commit -m "feat(pipeline): add Hacker News source adapter"
```

---

## Task 5: Product Hunt adapter

**Files:**
- Create: `packages/pipeline/src/adapters/producthunt.ts`
- Test: `packages/pipeline/test/producthunt.test.ts`
- Create fixture: `packages/pipeline/test/fixtures/ph-posts.json`

**Interfaces:**
- Produces: `export const productHuntAdapter: SourceAdapter` (name `"producthunt"`), `export function parsePhPosts(json: unknown): RawPost[]` (pure).

> Product Hunt exposes a GraphQL API requiring a developer token. The adapter is enabled only when `PRODUCTHUNT_TOKEN` is present AND `SOURCE_PRODUCTHUNT=true`. Used to detect demand via post/comment topics and tagline gaps.

- [ ] **Step 1: Create fixture**

`packages/pipeline/test/fixtures/ph-posts.json` (PH GraphQL `posts` shape):
```json
{
  "data": {
    "posts": {
      "edges": [
        {
          "node": {
            "id": "700001",
            "name": "InvoiceAuto",
            "tagline": "Auto-generate invoices from your payment provider",
            "url": "https://www.producthunt.com/posts/invoiceauto",
            "votesCount": 320,
            "commentsCount": 45,
            "createdAt": "2026-07-18T09:00:00Z",
            "user": { "username": "makerjane" }
          }
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Write failing test**

`packages/pipeline/test/producthunt.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePhPosts } from "../src/adapters/producthunt";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/ph-posts.json"), "utf8"));

describe("parsePhPosts", () => {
  it("maps GraphQL edges to RawPosts", () => {
    const posts = parsePhPosts(fixture);
    expect(posts).toHaveLength(1);
    const p = posts[0]!;
    expect(p.source).toBe("producthunt");
    expect(p.sourcePostId).toBe("700001");
    expect(p.url).toBe("https://www.producthunt.com/posts/invoiceauto");
    expect(p.title).toBe("InvoiceAuto");
    expect(p.content).toContain("Auto-generate invoices");
    expect(p.metrics).toEqual({ votes: 320, comments: 45 });
    expect(p.author).toBe("makerjane");
  });

  it("returns [] on missing edges", () => {
    expect(parsePhPosts({ data: { posts: {} } })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — verify fails.** `pnpm --filter @workspace/pipeline test producthunt` → FAIL.

- [ ] **Step 4: Implement**

`packages/pipeline/src/adapters/producthunt.ts`:
```ts
import type { PipelineEnv, RawPost, SourceAdapter } from "../types";

interface PhNode {
  id?: string;
  name?: string;
  tagline?: string;
  url?: string;
  votesCount?: number;
  commentsCount?: number;
  createdAt?: string;
  user?: { username?: string };
}

export function parsePhPosts(json: unknown): RawPost[] {
  const edges = (json as { data?: { posts?: { edges?: { node?: PhNode }[] } } })?.data?.posts
    ?.edges;
  if (!Array.isArray(edges)) return [];
  const out: RawPost[] = [];
  for (const e of edges) {
    const n = e.node;
    if (!n?.id || !n.url) continue;
    out.push({
      source: "producthunt",
      sourcePostId: n.id,
      url: n.url,
      author: n.user?.username,
      title: n.name,
      content: n.tagline ?? "",
      postedAt: n.createdAt ? new Date(n.createdAt) : undefined,
      metrics: { votes: n.votesCount ?? 0, comments: n.commentsCount ?? 0 },
    });
  }
  return out;
}

const QUERY = `query($after: DateTime) {
  posts(order: NEWEST, postedAfter: $after, first: 50) {
    edges { node { id name tagline url votesCount commentsCount createdAt user { username } } }
  }
}`;

export const productHuntAdapter: SourceAdapter = {
  name: "producthunt",
  enabled: (env) => env.sources.producthunt && !!env.productHuntToken,
  async fetchPosts(since: Date, env: PipelineEnv): Promise<RawPost[]> {
    if (!env.productHuntToken) throw new Error("PRODUCTHUNT_TOKEN missing");
    const res = await fetch("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.productHuntToken}`,
      },
      body: JSON.stringify({ query: QUERY, variables: { after: since.toISOString() } }),
    });
    if (!res.ok) throw new Error(`producthunt HTTP ${res.status}`);
    return parsePhPosts(await res.json());
  },
};
```

- [ ] **Step 5: Run — verify passes.** Expected: PASS (2 tests).

- [ ] **Step 6: Commit**
```bash
git add packages/pipeline/src/adapters/producthunt.ts packages/pipeline/test/producthunt.test.ts packages/pipeline/test/fixtures/ph-posts.json
git commit -m "feat(pipeline): add Product Hunt source adapter"
```

---

## Task 6: X and LinkedIn unofficial (Playwright) adapters — degradable

**Files:**
- Create: `packages/pipeline/src/adapters/x.ts`, `packages/pipeline/src/adapters/linkedin.ts`
- Create: `packages/pipeline/src/adapters/browser.ts` (shared Playwright helper)
- Test: `packages/pipeline/test/degradable.test.ts`

**Interfaces:**
- Consumes: `playwright`, `SourceAdapter`, `PipelineEnv`.
- Produces: `export const xAdapter: SourceAdapter` (name `"x"`), `export const linkedinAdapter: SourceAdapter` (name `"linkedin"`). Both `enabled()` require the source flag AND a session cookie; both throw on scrape failure so the orchestrator's per-adapter catch records the failure and the run degrades gracefully.

> These are best-effort, ToS-gray scrapers. They are disabled by default (`SOURCE_X`/`SOURCE_LINKEDIN` default false). The test verifies the enablement gate, not live scraping (no browser in CI). The scrape body is written but never exercised in CI.

- [ ] **Step 1: Write the failing test**

`packages/pipeline/test/degradable.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { xAdapter } from "../src/adapters/x";
import { linkedinAdapter } from "../src/adapters/linkedin";
import type { PipelineEnv } from "../src/types";

function env(overrides: Partial<PipelineEnv> = {}): PipelineEnv {
  return {
    databaseUrl: "x",
    anthropicApiKey: "x",
    monthlyUsdCap: 5,
    sources: { reddit: false, hackernews: false, producthunt: false, x: false, linkedin: false },
    redditUserAgent: "t",
    ...overrides,
  };
}

describe("degradable adapters enablement", () => {
  it("x is disabled without a session cookie even when the flag is on", () => {
    const e = env({ sources: { ...env().sources, x: true } });
    expect(xAdapter.enabled(e)).toBe(false);
  });

  it("x is enabled only with flag AND cookie", () => {
    const e = env({ sources: { ...env().sources, x: true }, xSessionCookie: "auth_token=abc" });
    expect(xAdapter.enabled(e)).toBe(true);
  });

  it("linkedin is disabled without a session cookie", () => {
    const e = env({ sources: { ...env().sources, linkedin: true } });
    expect(linkedinAdapter.enabled(e)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fails.** `pnpm --filter @workspace/pipeline test degradable` → FAIL (modules missing).

- [ ] **Step 3: Write the shared browser helper**

`packages/pipeline/src/adapters/browser.ts`:
```ts
import { chromium, type Browser } from "playwright";

export async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

// Parse a "name=value; name2=value2" cookie string into Playwright cookie objects
// scoped to a domain. Session cookies come from Actions secrets.
export function cookiesFor(domain: string, cookieString: string) {
  return cookieString
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return {
        name: pair.slice(0, eq),
        value: pair.slice(eq + 1),
        domain,
        path: "/",
      };
    });
}
```

- [ ] **Step 4: Write the X adapter**

`packages/pipeline/src/adapters/x.ts`:
```ts
import type { PipelineEnv, RawPost, SourceAdapter } from "../types";
import { cookiesFor, withBrowser } from "./browser";

const SEARCH = 'https://x.com/search?q=%22i%20wish%20there%20was%20an%20app%22&f=live';

export const xAdapter: SourceAdapter = {
  name: "x",
  enabled: (env) => env.sources.x && !!env.xSessionCookie,
  async fetchPosts(_since: Date, env: PipelineEnv): Promise<RawPost[]> {
    const cookie = env.xSessionCookie;
    if (!cookie) throw new Error("X_SESSION_COOKIE missing");
    return withBrowser(async (browser) => {
      const ctx = await browser.newContext();
      await ctx.addCookies(cookiesFor(".x.com", cookie));
      const page = await ctx.newPage();
      await page.goto(SEARCH, { waitUntil: "networkidle", timeout: 30_000 });
      const articles = await page.locator("article").all();
      const out: RawPost[] = [];
      for (const a of articles.slice(0, 50)) {
        const text = (await a.innerText().catch(() => "")).trim();
        const href = await a.locator('a[href*="/status/"]').first().getAttribute("href").catch(() => null);
        if (!href || !text) continue;
        const id = href.split("/status/")[1]?.split(/[/?]/)[0];
        if (!id) continue;
        out.push({
          source: "x",
          sourcePostId: id,
          url: `https://x.com${href}`,
          content: text,
          metrics: {},
        });
      }
      if (out.length === 0) throw new Error("x scrape returned 0 posts (layout changed or blocked)");
      return out;
    });
  },
};
```

- [ ] **Step 5: Write the LinkedIn adapter**

`packages/pipeline/src/adapters/linkedin.ts`:
```ts
import type { PipelineEnv, RawPost, SourceAdapter } from "../types";
import { cookiesFor, withBrowser } from "./browser";

const SEARCH =
  'https://www.linkedin.com/search/results/content/?keywords=%22looking%20for%20a%20tool%22';

export const linkedinAdapter: SourceAdapter = {
  name: "linkedin",
  enabled: (env) => env.sources.linkedin && !!env.linkedinSessionCookie,
  async fetchPosts(_since: Date, env: PipelineEnv): Promise<RawPost[]> {
    const cookie = env.linkedinSessionCookie;
    if (!cookie) throw new Error("LINKEDIN_SESSION_COOKIE missing");
    return withBrowser(async (browser) => {
      const ctx = await browser.newContext();
      await ctx.addCookies(cookiesFor(".linkedin.com", cookie));
      const page = await ctx.newPage();
      await page.goto(SEARCH, { waitUntil: "networkidle", timeout: 30_000 });
      const posts = await page.locator('div.feed-shared-update-v2').all();
      const out: RawPost[] = [];
      for (const [i, el] of posts.slice(0, 40).entries()) {
        const text = (await el.innerText().catch(() => "")).trim();
        const urn = await el.getAttribute("data-urn").catch(() => null);
        if (!text) continue;
        const id = urn ?? `linkedin-${Date.now()}-${i}`;
        out.push({
          source: "linkedin",
          sourcePostId: id,
          url: SEARCH,
          content: text,
          metrics: {},
        });
      }
      if (out.length === 0) throw new Error("linkedin scrape returned 0 posts (layout changed or blocked)");
      return out;
    });
  },
};
```

- [ ] **Step 6: Run — verify passes.** `pnpm --filter @workspace/pipeline test degradable` → PASS (3 tests).

- [ ] **Step 7: Commit**
```bash
git add packages/pipeline/src/adapters/browser.ts packages/pipeline/src/adapters/x.ts packages/pipeline/src/adapters/linkedin.ts packages/pipeline/test/degradable.test.ts
git commit -m "feat(pipeline): add degradable X and LinkedIn Playwright adapters"
```

---

## Task 7: Normalize + dedupe stage (raw_posts upsert)

**Files:**
- Create: `packages/pipeline/src/stages/normalize.ts`
- Test: `packages/pipeline/test/normalize.test.ts`

**Interfaces:**
- Consumes: `db`, `rawPosts` from `@workspace/db`; `RawPost` from `../types`.
- Produces: `export function dedupeInMemory(posts: RawPost[]): RawPost[]` (pure — drops duplicate `(source, sourcePostId)` within a batch, keeping the first); `export async function upsertRawPosts(posts: RawPost[], runId: number): Promise<number[]>` (returns inserted/existing row ids in input order; uses `onConflictDoUpdate` on the `(source, sourcePostId)` unique index).

- [ ] **Step 1: Write the failing test (pure function only — DB upsert is integration, tested via run)**

`packages/pipeline/test/normalize.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { dedupeInMemory } from "../src/stages/normalize";
import type { RawPost } from "../src/types";

function post(source: string, id: string): RawPost {
  return { source, sourcePostId: id, url: `u/${id}`, content: "", metrics: {} };
}

describe("dedupeInMemory", () => {
  it("removes duplicate (source, id) pairs keeping the first occurrence", () => {
    const input = [post("reddit", "a"), post("reddit", "a"), post("hackernews", "a")];
    const out = dedupeInMemory(input);
    expect(out).toHaveLength(2);
    expect(out.map((p) => `${p.source}:${p.sourcePostId}`)).toEqual(["reddit:a", "hackernews:a"]);
  });

  it("returns an empty array unchanged", () => {
    expect(dedupeInMemory([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify fails.** `pnpm --filter @workspace/pipeline test normalize` → FAIL.

- [ ] **Step 3: Implement**

`packages/pipeline/src/stages/normalize.ts`:
```ts
import { db, rawPosts, type NewRawPost } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import type { RawPost } from "../types";

export function dedupeInMemory(posts: RawPost[]): RawPost[] {
  const seen = new Set<string>();
  const out: RawPost[] = [];
  for (const p of posts) {
    const key = `${p.source}:${p.sourcePostId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// Upsert each post; return the DB row id for every input post (in order).
export async function upsertRawPosts(posts: RawPost[], runId: number): Promise<number[]> {
  const deduped = dedupeInMemory(posts);
  if (deduped.length === 0) return [];
  const rows: NewRawPost[] = deduped.map((p) => ({
    source: p.source,
    sourcePostId: p.sourcePostId,
    url: p.url,
    author: p.author,
    title: p.title,
    content: p.content,
    postedAt: p.postedAt,
    metrics: p.metrics,
    runId,
  }));
  await db
    .insert(rawPosts)
    .values(rows)
    .onConflictDoUpdate({
      target: [rawPosts.source, rawPosts.sourcePostId],
      // `excluded` refers to the row proposed for insertion, so each conflicting
      // row refreshes with ITS OWN metrics. Never reference a single row here.
      set: { metrics: sql`excluded.metrics`, fetchedAt: new Date() },
    });
  // Re-read ids for the batch.
  const keys = deduped.map((p) => ({ source: p.source, id: p.sourcePostId }));
  const found = await db
    .select({ id: rawPosts.id, source: rawPosts.source, sourcePostId: rawPosts.sourcePostId })
    .from(rawPosts)
    .where(
      inArray(
        rawPosts.sourcePostId,
        keys.map((k) => k.id),
      ),
    );
  const byKey = new Map(found.map((r) => [`${r.source}:${r.sourcePostId}`, r.id]));
  return deduped.map((p) => byKey.get(`${p.source}:${p.sourcePostId}`)!).filter((x) => x != null);
}
```

- [ ] **Step 4: Run — verify passes.** `pnpm --filter @workspace/pipeline test normalize` → PASS (2 tests). Then `pnpm --filter @workspace/pipeline typecheck` → passes.

- [ ] **Step 5: Commit**
```bash
git add packages/pipeline/src/stages/normalize.ts packages/pipeline/test/normalize.test.ts
git commit -m "feat(pipeline): add normalize + dedupe stage"
```

---

## Task 8: Relevance filter (keyword pre-filter + Haiku classify)

**Files:**
- Create: `packages/pipeline/src/anthropic.ts` (Haiku wrapper + cost accounting)
- Create: `packages/pipeline/src/stages/relevance.ts`
- Test: `packages/pipeline/test/relevance.test.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk`, `RawPost`, `PipelineEnv`.
- Produces:
  - `anthropic.ts`: `class HaikuClient { constructor(apiKey: string); classifyDemand(posts: {id: string; text: string}[]): Promise<Set<string>>; enrich(prompt: string): Promise<string>; get spentMillicents(): number }` — tracks cumulative cost from `usage`.
  - `relevance.ts`: `export function keywordPrefilter(posts: RawPost[]): RawPost[]` (pure — keeps posts whose text matches demand-signal regexes), `export async function filterRelevant(posts: RawPost[], client: HaikuClient): Promise<RawPost[]>`.

- [ ] **Step 1: Write the failing test for the pure prefilter**

`packages/pipeline/test/relevance.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { keywordPrefilter } from "../src/stages/relevance";
import type { RawPost } from "../src/types";

function post(content: string, title = ""): RawPost {
  return { source: "reddit", sourcePostId: Math.random().toString(), url: "u", title, content, metrics: {} };
}

describe("keywordPrefilter", () => {
  it("keeps posts expressing a tool/product wish", () => {
    const kept = keywordPrefilter([
      post("I wish there was a tool to auto-reconcile invoices"),
      post("great weather today"),
      post("", "Is there an app that does recurring exports?"),
    ]);
    expect(kept).toHaveLength(2);
  });

  it("is case-insensitive", () => {
    expect(keywordPrefilter([post("I WISH THERE WAS a way to do X")])).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — verify fails.** `pnpm --filter @workspace/pipeline test relevance` → FAIL.

- [ ] **Step 3: Write the Haiku client wrapper**

`packages/pipeline/src/anthropic.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";

// Haiku 4.5 pricing: $1.00 per 1M input tokens, $5.00 per 1M output tokens.
// Spend accumulates as a USD float and is exposed as integer "millicents"
// (1 millicent = 1e-5 USD) so callers compare against the cap without float drift.
const USD_PER_INPUT_TOKEN = 1.0 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 5.0 / 1_000_000;
const MILLICENTS_PER_USD = 100_000;

const MODEL = "claude-haiku-4-5";

export class HaikuClient {
  private client: Anthropic;
  private spentUsd = 0;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  get spentMillicents(): number {
    return Math.round(this.spentUsd * MILLICENTS_PER_USD);
  }

  private track(usage: { input_tokens: number; output_tokens: number }) {
    this.spentUsd += usage.input_tokens * USD_PER_INPUT_TOKEN;
    this.spentUsd += usage.output_tokens * USD_PER_OUTPUT_TOKEN;
  }

  async classifyDemand(posts: { id: string; text: string }[]): Promise<Set<string>> {
    if (posts.length === 0) return new Set();
    const numbered = posts.map((p, i) => `[${i}] ${p.text.slice(0, 400)}`).join("\n\n");
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You classify social posts. A post is RELEVANT if it expresses unmet demand for a software product/tool a founder could build (a wish, a complaint about a missing tool, a request for a recommendation that has no good answer). Return ONLY a JSON array of the integer indices that are relevant, e.g. [0,3,4].",
      messages: [{ role: "user", content: numbered }],
    });
    if (res.usage) this.track(res.usage);
    const text = res.content.find((b) => b.type === "text")?.text ?? "[]";
    const match = text.match(/\[[\d,\s]*\]/);
    const indices: number[] = match ? JSON.parse(match[0]) : [];
    return new Set(indices.map((i) => posts[i]?.id).filter((x): x is string => !!x));
  }

  async enrich(prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    if (res.usage) this.track(res.usage);
    return res.content.find((b) => b.type === "text")?.text ?? "";
  }
}
```

> Delete the unused `INPUT_MILLICENTS_PER_TOKEN` constant (kept only as a derivation note above) before committing — cost is tracked via `this.spentUsd`.

- [ ] **Step 4: Write relevance.ts**

`packages/pipeline/src/stages/relevance.ts`:
```ts
import type { RawPost } from "../types";
import type { HaikuClient } from "../anthropic";

const SIGNAL_PATTERNS: RegExp[] = [
  /\bi wish (there was|there were|i had|someone would)\b/i,
  /\bis there (a|an|any) (tool|app|service|software|way)\b/i,
  /\blooking for (a|an|some) (tool|app|service|software)\b/i,
  /\bdoes (anyone|anything) (know|exist)\b.*\b(tool|app|automat)/i,
  /\bwould (pay|happily pay|love)\b.*\b(tool|app|solve|fix)/i,
  /\bany recommendations? for\b.*\b(tool|app|software)/i,
];

export function keywordPrefilter(posts: RawPost[]): RawPost[] {
  return posts.filter((p) => {
    const text = `${p.title ?? ""} ${p.content}`;
    return SIGNAL_PATTERNS.some((re) => re.test(text));
  });
}

export async function filterRelevant(posts: RawPost[], client: HaikuClient): Promise<RawPost[]> {
  const pre = keywordPrefilter(posts);
  if (pre.length === 0) return [];
  const relevantIds = await client.classifyDemand(
    pre.map((p) => ({ id: `${p.source}:${p.sourcePostId}`, text: `${p.title ?? ""} ${p.content}` })),
  );
  return pre.filter((p) => relevantIds.has(`${p.source}:${p.sourcePostId}`));
}
```

- [ ] **Step 5: Run — verify passes.** `pnpm --filter @workspace/pipeline test relevance` → PASS (2 tests). `pnpm --filter @workspace/pipeline typecheck` → passes.

- [ ] **Step 6: Commit**
```bash
git add packages/pipeline/src/anthropic.ts packages/pipeline/src/stages/relevance.ts packages/pipeline/test/relevance.test.ts
git commit -m "feat(pipeline): add Haiku client and relevance filter stage"
```

---

## Task 9: Cluster stage (pg_trgm match into existing ideas)

**Files:**
- Create: `packages/pipeline/src/stages/cluster.ts`
- Test: `packages/pipeline/test/cluster.test.ts`

**Interfaces:**
- Consumes: `db`, `ideas` from `@workspace/db`; `HaikuClient`; `RawPost`.
- Produces:
  - `export function slugify(title: string): string` (pure).
  - `export function parseThemes(text: string): { title: string; postKeys: string[] }[]` (pure — parses Haiku's JSON theme grouping).
  - `export async function clusterPosts(posts: RawPost[], client: HaikuClient): Promise<{ themeTitle: string; posts: RawPost[]; matchedIdeaId: number | null }[]>` — groups posts into themes via Haiku, then for each theme queries `ideas` with `similarity(keywords, $theme) > 0.3` (pg_trgm) to find an existing idea to append evidence to.

- [ ] **Step 1: Write the failing test for pure helpers**

`packages/pipeline/test/cluster.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { slugify, parseThemes } from "../src/stages/cluster";

describe("slugify", () => {
  it("lowercases, strips punctuation, and hyphenates", () => {
    expect(slugify("Auto-Invoice Generator for Stripe!")).toBe("auto-invoice-generator-for-stripe");
  });
  it("collapses whitespace and trims hyphens", () => {
    expect(slugify("  Two   Words  ")).toBe("two-words");
  });
});

describe("parseThemes", () => {
  it("extracts theme objects from a JSON block in Haiku output", () => {
    const raw =
      'Here are the themes:\n[{"title":"Invoice automation","postKeys":["reddit:a","hackernews:b"]},{"title":"Pricing tracker","postKeys":["reddit:c"]}]';
    const themes = parseThemes(raw);
    expect(themes).toHaveLength(2);
    expect(themes[0]).toEqual({ title: "Invoice automation", postKeys: ["reddit:a", "hackernews:b"] });
  });
  it("returns [] when no JSON array is present", () => {
    expect(parseThemes("no themes found")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify fails.** `pnpm --filter @workspace/pipeline test cluster` → FAIL.

- [ ] **Step 3: Implement**

`packages/pipeline/src/stages/cluster.ts`:
```ts
import { db, ideas } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { RawPost } from "../types";
import type { HaikuClient } from "../anthropic";

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseThemes(text: string): { title: string; postKeys: string[] }[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t) => t && typeof t.title === "string" && Array.isArray(t.postKeys))
      .map((t) => ({ title: t.title as string, postKeys: t.postKeys as string[] }));
  } catch {
    return [];
  }
}

async function findSimilarIdea(themeTitle: string): Promise<number | null> {
  // pg_trgm similarity on the keywords column; threshold 0.3.
  const rows = await db
    .select({ id: ideas.id, sim: sql<number>`similarity(${ideas.keywords}, ${themeTitle})` })
    .from(ideas)
    .where(sql`similarity(${ideas.keywords}, ${themeTitle}) > 0.3`)
    .orderBy(sql`similarity(${ideas.keywords}, ${themeTitle}) DESC`)
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function clusterPosts(
  posts: RawPost[],
  client: HaikuClient,
): Promise<{ themeTitle: string; posts: RawPost[]; matchedIdeaId: number | null }[]> {
  if (posts.length === 0) return [];
  const byKey = new Map(posts.map((p) => [`${p.source}:${p.sourcePostId}`, p]));
  const listing = posts
    .map((p) => `${p.source}:${p.sourcePostId} => ${(p.title ?? p.content).slice(0, 200)}`)
    .join("\n");
  const prompt =
    `Group these posts into distinct product-demand themes. Each theme is one buildable SaaS idea.\n` +
    `Return ONLY a JSON array: [{"title": "<short theme title>", "postKeys": ["source:id", ...]}].\n\n` +
    listing;
  const themes = parseThemes(await client.enrich(prompt));
  const result: { themeTitle: string; posts: RawPost[]; matchedIdeaId: number | null }[] = [];
  for (const t of themes) {
    const themePosts = t.postKeys.map((k) => byKey.get(k)).filter((p): p is RawPost => !!p);
    if (themePosts.length === 0) continue;
    result.push({ themeTitle: t.title, posts: themePosts, matchedIdeaId: await findSimilarIdea(t.title) });
  }
  return result;
}
```

- [ ] **Step 4: Run — verify passes.** `pnpm --filter @workspace/pipeline test cluster` → PASS (4 tests). Typecheck passes.

- [ ] **Step 5: Commit**
```bash
git add packages/pipeline/src/stages/cluster.ts packages/pipeline/test/cluster.test.ts
git commit -m "feat(pipeline): add clustering stage with pg_trgm idea matching"
```

---

## Task 10: Enrich stage + orchestrator + report + GitHub Actions

**Files:**
- Create: `packages/pipeline/src/stages/enrich.ts`
- Create: `packages/pipeline/src/report.ts`
- Create: `packages/pipeline/src/run.ts`
- Create: `packages/pipeline/src/cli.ts`
- Create: `packages/pipeline/.env.example`
- Create: `.github/workflows/pipeline.yml`
- Test: `packages/pipeline/test/enrich.test.ts`, `packages/pipeline/test/report.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `enrich.ts`: `export function parseEnrichedIdea(text: string): EnrichedIdea | null` (pure — parses Haiku JSON), `export async function enrichTheme(themeTitle: string, posts: RawPost[], client: HaikuClient): Promise<EnrichedIdea | null>`, `export async function persistIdea(idea: EnrichedIdea, posts: RawPost[], postIds: number[], matchedIdeaId: number | null): Promise<void>`.
  - `report.ts`: `class PipelineRunReport { addSource(name, fetched, failed?, error?); toStats(): Record<string, unknown>; get status(): "success"|"partial"|"failed"; writeGithubSummary(): void }`.
  - `run.ts`: `export async function runPipeline(): Promise<PipelineRunReport>`.

- [ ] **Step 1: Read the modified-Next.js note is not needed here (pipeline is plain Node). Proceed.**

- [ ] **Step 2: Write the failing enrich test**

`packages/pipeline/test/enrich.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseEnrichedIdea } from "../src/stages/enrich";

describe("parseEnrichedIdea", () => {
  it("parses a well-formed Haiku JSON idea and clamps demandScore", () => {
    const raw = `{
      "title": "Stripe Invoice Automator",
      "oneLiner": "Auto-generate branded invoices from Stripe charges.",
      "description": "A tool that watches Stripe and emits invoices.",
      "niche": "fintech-ops",
      "keywords": "invoice stripe automation billing",
      "demandScore": 150,
      "mrrLow": 500,
      "mrrHigh": 4000,
      "competitionNotes": "Some incumbents but gaps in SMB tier.",
      "validationSignals": ["multiple would-pay quotes", "34 comments"]
    }`;
    const idea = parseEnrichedIdea(raw)!;
    expect(idea.title).toBe("Stripe Invoice Automator");
    expect(idea.demandScore).toBe(100); // clamped to 0-100
    expect(idea.mrrLow).toBe(500);
    expect(idea.validationSignals).toContain("34 comments");
  });

  it("returns null when required fields are missing", () => {
    expect(parseEnrichedIdea('{"title": "x"}')).toBeNull();
  });

  it("returns null on non-JSON", () => {
    expect(parseEnrichedIdea("sorry, I cannot")).toBeNull();
  });
});
```

- [ ] **Step 3: Write the failing report test**

`packages/pipeline/test/report.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { PipelineRunReport } from "../src/report";

describe("PipelineRunReport", () => {
  it("is success when all sources succeeded", () => {
    const r = new PipelineRunReport();
    r.addSource("reddit", 10);
    r.addSource("hackernews", 5);
    expect(r.status).toBe("success");
  });

  it("is partial when some sources failed but others produced posts", () => {
    const r = new PipelineRunReport();
    r.addSource("reddit", 10);
    r.addSource("x", 0, true, "layout changed");
    expect(r.status).toBe("partial");
  });

  it("is failed when every source failed", () => {
    const r = new PipelineRunReport();
    r.addSource("reddit", 0, true, "HTTP 429");
    expect(r.status).toBe("failed");
  });

  it("serializes per-source stats", () => {
    const r = new PipelineRunReport();
    r.addSource("reddit", 10);
    r.addSource("x", 0, true, "blocked");
    const stats = r.toStats();
    expect(stats.sources).toMatchObject({
      reddit: { fetched: 10, failed: false },
      x: { fetched: 0, failed: true, error: "blocked" },
    });
  });
});
```

- [ ] **Step 4: Run — verify both fail.** `pnpm --filter @workspace/pipeline test enrich report` → FAIL.

- [ ] **Step 5: Implement report.ts**

`packages/pipeline/src/report.ts`:
```ts
import { appendFileSync } from "node:fs";

interface SourceStat {
  fetched: number;
  failed: boolean;
  error?: string;
}

export class PipelineRunReport {
  private sources: Record<string, SourceStat> = {};
  ideasCreated = 0;
  ideasUpdated = 0;
  spentMillicents = 0;

  addSource(name: string, fetched: number, failed = false, error?: string): void {
    this.sources[name] = { fetched, failed, ...(error ? { error } : {}) };
  }

  get status(): "success" | "partial" | "failed" {
    const entries = Object.values(this.sources);
    if (entries.length === 0) return "failed";
    const anyFailed = entries.some((s) => s.failed);
    const anySucceeded = entries.some((s) => !s.failed);
    if (!anySucceeded) return "failed";
    return anyFailed ? "partial" : "success";
  }

  toStats(): Record<string, unknown> {
    return {
      sources: this.sources,
      ideasCreated: this.ideasCreated,
      ideasUpdated: this.ideasUpdated,
      spentUsd: (this.spentMillicents / 100000).toFixed(4),
    };
  }

  writeGithubSummary(): void {
    const path = process.env.GITHUB_STEP_SUMMARY;
    if (!path) return;
    const lines = [
      `## Pipeline run: ${this.status}`,
      "",
      "| source | fetched | failed | error |",
      "| --- | --- | --- | --- |",
      ...Object.entries(this.sources).map(
        ([n, s]) => `| ${n} | ${s.fetched} | ${s.failed} | ${s.error ?? ""} |`,
      ),
      "",
      `- ideas created: ${this.ideasCreated}`,
      `- ideas updated: ${this.ideasUpdated}`,
      `- estimated spend: $${(this.spentMillicents / 100000).toFixed(4)}`,
    ];
    appendFileSync(path, lines.join("\n") + "\n");
  }
}
```

- [ ] **Step 6: Implement enrich.ts**

`packages/pipeline/src/stages/enrich.ts`:
```ts
import { db, ideas, ideaEvidence } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { EnrichedIdea, RawPost } from "../types";
import type { HaikuClient } from "../anthropic";
import { slugify } from "./cluster";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function parseEnrichedIdea(text: string): EnrichedIdea | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const n = (k: string) => (typeof raw[k] === "number" ? (raw[k] as number) : undefined);
  const title = s("title");
  const oneLiner = s("oneLiner");
  const description = s("description");
  const niche = s("niche");
  if (!title || !oneLiner || !description || !niche) return null;
  return {
    title,
    oneLiner,
    description,
    niche,
    keywords: s("keywords") ?? "",
    demandScore: clamp(Math.round(n("demandScore") ?? 0), 0, 100),
    mrrLow: Math.max(0, Math.round(n("mrrLow") ?? 0)),
    mrrHigh: Math.max(0, Math.round(n("mrrHigh") ?? 0)),
    competitionNotes: s("competitionNotes") ?? "",
    validationSignals: Array.isArray(raw.validationSignals)
      ? (raw.validationSignals as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
  };
}

export async function enrichTheme(
  themeTitle: string,
  posts: RawPost[],
  client: HaikuClient,
): Promise<EnrichedIdea | null> {
  const evidence = posts
    .map((p) => `- [${p.source}] ${(p.title ?? "").trim()} ${p.content.slice(0, 300)} (${JSON.stringify(p.metrics)})`)
    .join("\n");
  const prompt =
    `You are a SaaS analyst. Turn this cluster of demand posts about "${themeTitle}" into a structured idea.\n` +
    `Estimate a CONSERVATIVE potential MRR range in whole USD, derived from audience-size signals × a plausible price × a low conversion. Always treat it as an estimate.\n` +
    `Return ONLY JSON with keys: title, oneLiner, description, niche, keywords (space-separated), demandScore (0-100 integer), mrrLow (int USD), mrrHigh (int USD), competitionNotes, validationSignals (array of short strings).\n\n` +
    `Evidence:\n${evidence}`;
  return parseEnrichedIdea(await client.enrich(prompt));
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || "idea";
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.select({ id: ideas.id }).from(ideas).where(eq(ideas.slug, slug)).limit(1);
    if (existing.length === 0) return slug;
    slug = `${base}-${++i}`;
  }
}

// Persist a new draft idea, OR append evidence and bump ask_count on an existing one.
export async function persistIdea(
  idea: EnrichedIdea,
  posts: RawPost[],
  postIds: number[],
  matchedIdeaId: number | null,
): Promise<"created" | "updated"> {
  if (matchedIdeaId != null) {
    await db
      .update(ideas)
      .set({ askCount: sql`${ideas.askCount} + ${posts.length}` })
      .where(eq(ideas.id, matchedIdeaId));
    await linkEvidence(matchedIdeaId, postIds);
    return "updated";
  }
  const slug = await uniqueSlug(slugify(idea.title));
  const [row] = await db
    .insert(ideas)
    .values({
      slug,
      title: idea.title,
      oneLiner: idea.oneLiner,
      description: idea.description,
      niche: idea.niche,
      keywords: idea.keywords,
      demandScore: idea.demandScore,
      mrrLow: idea.mrrLow,
      mrrHigh: idea.mrrHigh,
      competitionNotes: idea.competitionNotes,
      validationSignals: idea.validationSignals,
      askCount: posts.length,
      status: "draft",
      isFree: false,
    })
    .returning({ id: ideas.id });
  await linkEvidence(row!.id, postIds);
  return "created";
}

async function linkEvidence(ideaId: number, postIds: number[]): Promise<void> {
  if (postIds.length === 0) return;
  await db
    .insert(ideaEvidence)
    .values(postIds.map((rawPostId) => ({ ideaId, rawPostId, role: "demand" })))
    .onConflictDoNothing();
}
```

- [ ] **Step 7: Run — verify enrich + report pass.** `pnpm --filter @workspace/pipeline test enrich report` → PASS (7 tests).

- [ ] **Step 8: Implement the orchestrator run.ts**

`packages/pipeline/src/run.ts`:
```ts
import { db, pipelineRuns } from "@workspace/db";
import { eq } from "drizzle-orm";
import { enabledAdapters, loadEnv } from "./config";
import type { RawPost, SourceAdapter } from "./types";
import { redditAdapter } from "./adapters/reddit";
import { hackerNewsAdapter } from "./adapters/hackernews";
import { productHuntAdapter } from "./adapters/producthunt";
import { xAdapter } from "./adapters/x";
import { linkedinAdapter } from "./adapters/linkedin";
import { upsertRawPosts } from "./stages/normalize";
import { HaikuClient } from "./anthropic";
import { filterRelevant } from "./stages/relevance";
import { clusterPosts } from "./stages/cluster";
import { enrichTheme, persistIdea } from "./stages/enrich";
import { PipelineRunReport } from "./report";

// The concrete adapter list. Swapping an unofficial adapter for an official one
// = replacing an entry here. The `enabled()` gate + config flags decide what runs.
const ADAPTERS: SourceAdapter[] = [
  redditAdapter,
  hackerNewsAdapter,
  productHuntAdapter,
  xAdapter,
  linkedinAdapter,
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function runPipeline(): Promise<PipelineRunReport> {
  const env = loadEnv();
  const report = new PipelineRunReport();
  const since = new Date(Date.now() - WEEK_MS);

  const [run] = await db.insert(pipelineRuns).values({ status: "running" }).returning({ id: pipelineRuns.id });
  const runId = run!.id;

  // 1. Fetch — each adapter isolated. A failure is recorded and skipped.
  const collected: RawPost[] = [];
  for (const adapter of enabledAdapters(ADAPTERS, env)) {
    try {
      const posts = await adapter.fetchPosts(since, env);
      report.addSource(adapter.name, posts.length);
      collected.push(...posts);
    } catch (err) {
      report.addSource(adapter.name, 0, true, err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Normalize + dedupe + persist raw posts.
  const postIds = await upsertRawPosts(collected, runId);
  const idByKey = new Map(collected.map((p, i) => [`${p.source}:${p.sourcePostId}`, postIds[i]]));

  // 3. Relevance filter (cost-gated).
  const client = new HaikuClient(env.anthropicApiKey);
  const capMillicents = env.monthlyUsdCap * 100_000;
  let relevant: RawPost[] = [];
  if (client.spentMillicents < capMillicents) {
    relevant = await filterRelevant(collected, client);
  }

  // 4. Cluster into themes.
  const themes = client.spentMillicents < capMillicents ? await clusterPosts(relevant, client) : [];

  // 5. Enrich + persist, aborting before the cap is exceeded.
  for (const theme of themes) {
    if (client.spentMillicents >= capMillicents) break;
    const idea = await enrichTheme(theme.themeTitle, theme.posts, client);
    if (!idea) continue;
    const ids = theme.posts
      .map((p) => idByKey.get(`${p.source}:${p.sourcePostId}`))
      .filter((x): x is number => typeof x === "number");
    const outcome = await persistIdea(idea, theme.posts, ids, theme.matchedIdeaId);
    if (outcome === "created") report.ideasCreated++;
    else report.ideasUpdated++;
  }

  report.spentMillicents = client.spentMillicents;
  await db
    .update(pipelineRuns)
    .set({
      status: report.status,
      finishedAt: new Date(),
      stats: report.toStats(),
      estimatedMillicents: report.spentMillicents,
    })
    .where(eq(pipelineRuns.id, runId));

  return report;
}
```

- [ ] **Step 9: Implement cli.ts**

`packages/pipeline/src/cli.ts`:
```ts
import "dotenv/config";
import { runPipeline } from "./run";

runPipeline()
  .then((report) => {
    report.writeGithubSummary();
    console.log(JSON.stringify(report.toStats(), null, 2));
    // Non-zero exit on total failure so the Actions job (and issue-on-failure) fires.
    if (report.status === "failed") process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 10: Write .env.example**

`packages/pipeline/.env.example`:
```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
ANTHROPIC_API_KEY=sk-ant-...
PIPELINE_MONTHLY_USD_CAP=5
SOURCE_REDDIT=true
SOURCE_HACKERNEWS=true
SOURCE_PRODUCTHUNT=false
SOURCE_X=false
SOURCE_LINKEDIN=false
REDDIT_USER_AGENT=demand-ideas-bot/0.1 (by /u/yourname)
PRODUCTHUNT_TOKEN=
X_SESSION_COOKIE=
LINKEDIN_SESSION_COOKIE=
```

- [ ] **Step 11: Write the GitHub Actions workflow**

`.github/workflows/pipeline.yml`:
```yaml
name: weekly-pipeline
on:
  schedule:
    - cron: "0 9 * * 1" # Mondays 09:00 UTC
  workflow_dispatch: {}

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Install Playwright browsers
        run: pnpm --filter @workspace/pipeline exec playwright install --with-deps chromium
      - name: Run pipeline
        id: pipeline
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          PIPELINE_MONTHLY_USD_CAP: "5"
          SOURCE_REDDIT: "true"
          SOURCE_HACKERNEWS: "true"
          SOURCE_PRODUCTHUNT: ${{ vars.SOURCE_PRODUCTHUNT || 'false' }}
          SOURCE_X: ${{ vars.SOURCE_X || 'false' }}
          SOURCE_LINKEDIN: ${{ vars.SOURCE_LINKEDIN || 'false' }}
          REDDIT_USER_AGENT: ${{ vars.REDDIT_USER_AGENT || 'demand-ideas-bot/0.1' }}
          PRODUCTHUNT_TOKEN: ${{ secrets.PRODUCTHUNT_TOKEN }}
          X_SESSION_COOKIE: ${{ secrets.X_SESSION_COOKIE }}
          LINKEDIN_SESSION_COOKIE: ${{ secrets.LINKEDIN_SESSION_COOKIE }}
        run: pnpm --filter @workspace/pipeline start
      - name: Open an issue on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Weekly pipeline failed: run ${context.runId}`,
              body: `The weekly demand pipeline failed. See the run: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
              labels: ["pipeline-failure"],
            });
```

- [ ] **Step 12: Typecheck the whole pipeline package**

Run: `pnpm --filter @workspace/pipeline typecheck && pnpm --filter @workspace/pipeline test`
Expected: typecheck passes; all pipeline tests pass.

- [ ] **Step 13: Commit**
```bash
git add packages/pipeline/src/stages/enrich.ts packages/pipeline/src/report.ts packages/pipeline/src/run.ts packages/pipeline/src/cli.ts packages/pipeline/.env.example packages/pipeline/test/enrich.test.ts packages/pipeline/test/report.test.ts .github/workflows/pipeline.yml
git commit -m "feat(pipeline): add enrich stage, orchestrator, run report, and weekly GH Actions workflow"
```

---

## Task 11: Wire `@workspace/db` into the web app + shared queries

**Files:**
- Modify: `apps/web/package.json` (add deps)
- Create: `apps/web/lib/db.ts`
- Create: `packages/db/src/queries.ts`, and re-export from `packages/db/src/index.ts`
- Test: `packages/db/test/queries.test.ts` + `packages/db/vitest.config.ts` + add `vitest` devDep and `test` script to `packages/db/package.json`

**Interfaces:**
- Produces (`queries.ts`, pure/DB-agnostic helpers where possible):
  - `export function orderIdeasForListing(ideas: Idea[]): Idea[]` (pure — free ideas first, then by demandScore desc, then publishedAt desc).
  - `export async function listPublishedIdeas(): Promise<Idea[]>`
  - `export async function getPublishedIdeaBySlug(slug: string): Promise<Idea | undefined>`
  - `export async function getEvidenceForIdea(ideaId: number): Promise<RawPost[]>`

- [ ] **Step 1: Add deps to apps/web**

Edit `apps/web/package.json` `dependencies` — add:
```json
"@workspace/db": "workspace:*",
"better-auth": "^1.2.0",
"resend": "^4.0.0"
```
(Better Auth + Resend are installed now but used in Task 12.)

- [ ] **Step 2: Create the web db re-export**

`apps/web/lib/db.ts`:
```ts
export * from "@workspace/db";
```

- [ ] **Step 3: Add a vitest setup to packages/db**

Add to `packages/db/package.json` `devDependencies`: `"vitest": "^3.0.5"`, and to `scripts`: `"test": "vitest run"`.

`packages/db/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["test/**/*.test.ts"] } });
```

- [ ] **Step 4: Write the failing test for the pure ordering helper**

`packages/db/test/queries.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { orderIdeasForListing } from "../src/queries";
import type { Idea } from "../src/index";

function idea(over: Partial<Idea>): Idea {
  return {
    id: 1, slug: "s", title: "t", oneLiner: "o", description: "d", niche: "n",
    keywords: "", demandScore: 0, mrrLow: 0, mrrHigh: 0, competitionNotes: "",
    validationSignals: [], askCount: 0, status: "published", isFree: false,
    createdAt: new Date(0), publishedAt: new Date(0), ...over,
  } as Idea;
}

describe("orderIdeasForListing", () => {
  it("puts free ideas first, then higher demandScore first", () => {
    const out = orderIdeasForListing([
      idea({ id: 1, isFree: false, demandScore: 90 }),
      idea({ id: 2, isFree: true, demandScore: 10 }),
      idea({ id: 3, isFree: false, demandScore: 95 }),
    ]);
    expect(out.map((i) => i.id)).toEqual([2, 3, 1]);
  });
});
```

- [ ] **Step 5: Run — verify fails.** `pnpm --filter @workspace/db test` → FAIL.

- [ ] **Step 6: Implement queries.ts**

`packages/db/src/queries.ts`:
```ts
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { ideas, ideaEvidence, rawPosts } from "./schema";
import type { Idea, RawPost } from "./index";

export function orderIdeasForListing(list: Idea[]): Idea[] {
  return [...list].sort((a, b) => {
    if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
    if (b.demandScore !== a.demandScore) return b.demandScore - a.demandScore;
    return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
  });
}

export async function listPublishedIdeas(): Promise<Idea[]> {
  const rows = await db.select().from(ideas).where(eq(ideas.status, "published"));
  return orderIdeasForListing(rows);
}

export async function getPublishedIdeaBySlug(slug: string): Promise<Idea | undefined> {
  const rows = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.slug, slug), eq(ideas.status, "published")))
    .limit(1);
  return rows[0];
}

export async function getEvidenceForIdea(ideaId: number): Promise<RawPost[]> {
  const links = await db
    .select({ rawPostId: ideaEvidence.rawPostId })
    .from(ideaEvidence)
    .where(eq(ideaEvidence.ideaId, ideaId));
  if (links.length === 0) return [];
  return db
    .select()
    .from(rawPosts)
    .where(inArray(rawPosts.id, links.map((l) => l.rawPostId)))
    .orderBy(desc(rawPosts.postedAt));
}
```

Add to `packages/db/src/index.ts`:
```ts
export * from "./queries";
```

- [ ] **Step 7: Run — verify passes.** `pnpm install && pnpm --filter @workspace/db test` → PASS. `pnpm --filter @workspace/db typecheck` → passes.

- [ ] **Step 8: Commit**
```bash
git add packages/db apps/web/package.json apps/web/lib/db.ts pnpm-lock.yaml
git commit -m "feat(db): add shared listing queries; wire db into web app"
```

---

## Task 12: Better Auth (Google + magic link) + Resend

**Files:**
- Create: `apps/web/lib/auth.ts`, `apps/web/lib/auth-client.ts`
- Create: `apps/web/app/api/auth/[...all]/route.ts`
- Create: `apps/web/.env.example`
- Modify: `packages/db/src/schema.ts` if Better Auth's generator requires column changes (Task 1 Step 3 note)

**Interfaces:**
- Produces:
  - `auth.ts`: `export const auth` (Better Auth instance using the Drizzle adapter + `@workspace/db` schema, Google social provider, and magic-link plugin sending via Resend).
  - `auth-client.ts`: `export const authClient` with `signIn`, `signOut`, `useSession`.

> BEFORE writing route handlers, read `node_modules/next/dist/docs/` for the current route-handler API (this is a modified Next.js).

- [ ] **Step 1: Read modified-Next.js route-handler docs**

Run: `ls node_modules/next/dist/docs/` and read the route-handlers / app-router guide. Confirm the `export const { GET, POST } = ...` handler shape and any changed conventions. Note deviations before writing the handler.

- [ ] **Step 2: Reconcile the auth schema**

Run Better Auth's schema generator against `@workspace/db`:
```bash
cd apps/web && npx @better-auth/cli@latest generate --config lib/auth.ts
```
(If it errors because `lib/auth.ts` doesn't exist yet, write a minimal `auth.ts` from Step 3 first, then run the generator.) Compare its output to the `user`/`session`/`account`/`verification` tables in `packages/db/src/schema.ts`; add any missing columns, then regenerate the DB migration (`pnpm --filter @workspace/db db:generate`). Commit schema changes as part of this task.

- [ ] **Step 3: Write auth.ts**

`apps/web/lib/auth.ts`:
```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db, schema } from "@workspace/db";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "login@yourdomain.com",
          to: email,
          subject: "Your sign-in link",
          text: `Click to sign in: ${url}`,
        });
      },
    }),
  ],
});
```

- [ ] **Step 4: Write auth-client.ts**

`apps/web/lib/auth-client.ts`:
```ts
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 5: Write the catch-all route handler**

`apps/web/app/api/auth/[...all]/route.ts` (adjust to the shape confirmed in Step 1):
```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 6: Write .env.example**

`apps/web/.env.example`:
```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
BETTER_AUTH_SECRET=generate-a-long-random-string
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
EMAIL_FROM=login@yourdomain.com
ABACATEPAY_API_KEY=
ABACATEPAY_WEBHOOK_SECRET=
ADMIN_USER_IDS=
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: passes. (If Better Auth types complain about the schema, resolve per Step 2.)

- [ ] **Step 8: Commit**
```bash
git add apps/web/lib/auth.ts apps/web/lib/auth-client.ts apps/web/app/api/auth apps/web/.env.example packages/db/src/schema.ts packages/db/drizzle
git commit -m "feat(web): add Better Auth with Google OAuth and Resend magic links"
```

---

## Task 13: PaymentProvider interface + AbacatePay adapter + checkout/webhook routes

**Files:**
- Create: `apps/web/lib/payments/provider.ts`, `apps/web/lib/payments/abacatepay.ts`, `apps/web/lib/payments/index.ts`
- Create: `apps/web/app/api/payments/checkout/route.ts`, `apps/web/app/api/payments/webhook/route.ts`
- Test: `apps/web/lib/payments/abacatepay.test.ts` + `apps/web/vitest.config.ts` (+ vitest devDep/script in `apps/web/package.json`)

**Interfaces:**
- Produces:
  - `provider.ts`:
    ```ts
    export interface CheckoutResult { url: string; providerChargeId: string }
    export interface PaymentEvent { type: "paid" | "other"; providerChargeId: string; externalId?: string }
    export interface PaymentProvider {
      readonly name: string;
      createCheckout(input: { userId: string; amountCents: number; returnUrl: string; completionUrl: string }): Promise<CheckoutResult>;
      verifyAndParseWebhook(rawBody: string, signature: string | null): PaymentEvent | null;
    }
    ```
  - `abacatepay.ts`: `export class AbacatePayProvider implements PaymentProvider` + `export function verifyHmac(rawBody: string, signature: string | null, secret: string): boolean` (pure), `export function parseAbacateEvent(body: unknown): PaymentEvent | null` (pure).
  - `index.ts`: `export function getPaymentProvider(): PaymentProvider` (returns AbacatePay).

> **AbacatePay v2 facts** (from docs): base `https://api.abacatepay.com/v2`, `Authorization: Bearer <key>`, create checkout `POST /checkouts/create` returning `{ data: { url, id }, success, error }`, webhooks signed via HMAC using the configured `secret`, paid event type contains `checkout.completed`. Response envelope is `{ data, success, error }`. Confirm exact webhook payload/signature header names against current docs when implementing; keep parsing tolerant.

- [ ] **Step 1: Add vitest to apps/web**

Add to `apps/web/package.json` `devDependencies`: `"vitest": "^3.0.5"`; `scripts`: `"test": "vitest run"`.

`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
```

- [ ] **Step 2: Write provider.ts**

`apps/web/lib/payments/provider.ts`:
```ts
export interface CheckoutResult {
  url: string;
  providerChargeId: string;
}

export interface PaymentEvent {
  type: "paid" | "other";
  providerChargeId: string;
  externalId?: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: {
    userId: string;
    amountCents: number;
    returnUrl: string;
    completionUrl: string;
  }): Promise<CheckoutResult>;
  verifyAndParseWebhook(rawBody: string, signature: string | null): PaymentEvent | null;
}
```

- [ ] **Step 3: Write the failing test for the pure functions**

`apps/web/lib/payments/abacatepay.test.ts`:
```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseAbacateEvent, verifyHmac } from "./abacatepay";

const SECRET = "whsec_test";

describe("verifyHmac", () => {
  it("accepts a correctly signed body", () => {
    const body = '{"event":"checkout.completed"}';
    const sig = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyHmac(body, sig, SECRET)).toBe(true);
  });
  it("rejects a bad signature", () => {
    expect(verifyHmac('{"x":1}', "deadbeef", SECRET)).toBe(false);
  });
  it("rejects a null signature", () => {
    expect(verifyHmac("{}", null, SECRET)).toBe(false);
  });
});

describe("parseAbacateEvent", () => {
  it("maps a completed checkout to a paid event", () => {
    const ev = parseAbacateEvent({
      event: "checkout.completed",
      data: { id: "chk_123", externalId: "user_abc" },
    });
    expect(ev).toEqual({ type: "paid", providerChargeId: "chk_123", externalId: "user_abc" });
  });
  it("maps other events to type other", () => {
    const ev = parseAbacateEvent({ event: "checkout.refunded", data: { id: "chk_123" } });
    expect(ev?.type).toBe("other");
  });
  it("returns null on unrecognized shape", () => {
    expect(parseAbacateEvent({ nope: true })).toBeNull();
  });
});
```

- [ ] **Step 4: Run — verify fails.** `pnpm --filter web test` → FAIL (module missing).

- [ ] **Step 5: Implement abacatepay.ts**

`apps/web/lib/payments/abacatepay.ts`:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutResult, PaymentEvent, PaymentProvider } from "./provider";

const BASE_URL = "https://api.abacatepay.com/v2";

export function verifyHmac(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseAbacateEvent(body: unknown): PaymentEvent | null {
  const b = body as { event?: string; data?: { id?: string; externalId?: string } };
  if (!b?.event || !b.data?.id) return null;
  const paid = b.event === "checkout.completed" || b.event === "transparent.completed";
  return {
    type: paid ? "paid" : "other",
    providerChargeId: b.data.id,
    externalId: b.data.externalId,
  };
}

export class AbacatePayProvider implements PaymentProvider {
  readonly name = "abacatepay";
  constructor(
    private apiKey = process.env.ABACATEPAY_API_KEY ?? "",
    private webhookSecret = process.env.ABACATEPAY_WEBHOOK_SECRET ?? "",
  ) {}

  async createCheckout(input: {
    userId: string;
    amountCents: number;
    returnUrl: string;
    completionUrl: string;
  }): Promise<CheckoutResult> {
    const res = await fetch(`${BASE_URL}/checkouts/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        methods: ["PIX"],
        frequency: "ONE_TIME",
        externalId: input.userId,
        returnUrl: input.returnUrl,
        completionUrl: input.completionUrl,
        // Lifetime access is a single fixed-price line item.
        products: [
          {
            externalId: "lifetime-access",
            name: "Lifetime access to the idea database",
            quantity: 1,
            price: input.amountCents,
          },
        ],
      }),
    });
    const json = (await res.json()) as {
      data?: { url?: string; id?: string };
      error?: unknown;
    };
    if (!res.ok || !json.data?.url || !json.data.id) {
      throw new Error(`abacatepay checkout failed: ${JSON.stringify(json.error ?? json)}`);
    }
    return { url: json.data.url, providerChargeId: json.data.id };
  }

  verifyAndParseWebhook(rawBody: string, signature: string | null): PaymentEvent | null {
    if (!verifyHmac(rawBody, signature, this.webhookSecret)) return null;
    try {
      return parseAbacateEvent(JSON.parse(rawBody));
    } catch {
      return null;
    }
  }
}
```

> The exact `products`/`price`/field names and the webhook signature header name should be confirmed against current AbacatePay docs at implementation time. Keep `parseAbacateEvent` tolerant of both `checkout.*` and `transparent.*` completed events.

- [ ] **Step 6: Implement index.ts**

`apps/web/lib/payments/index.ts`:
```ts
import { AbacatePayProvider } from "./abacatepay";
import type { PaymentProvider } from "./provider";

export function getPaymentProvider(): PaymentProvider {
  // Swap here to add Stripe/Polar later behind the same interface.
  return new AbacatePayProvider();
}
```

- [ ] **Step 7: Run — verify passes.** `pnpm --filter web test` → PASS (6 tests).

- [ ] **Step 8: Read modified-Next.js route-handler docs (if not already this session), then write the checkout route**

`apps/web/app/api/payments/checkout/route.ts`:
```ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";

const PRICE_CENTS = 11000; // R$110 ≈ $20

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const provider = getPaymentProvider();
  const checkout = await provider.createCheckout({
    userId: session.user.id,
    amountCents: PRICE_CENTS,
    returnUrl: `${appUrl}/ideas`,
    completionUrl: `${appUrl}/account?purchase=success`,
  });
  await db.insert(purchases).values({
    userId: session.user.id,
    provider: provider.name,
    providerChargeId: checkout.providerChargeId,
    amountCents: PRICE_CENTS,
    currency: "BRL",
    status: "pending",
  });
  return NextResponse.json({ url: checkout.url });
}
```

- [ ] **Step 9: Write the webhook route**

`apps/web/app/api/payments/webhook/route.ts`:
```ts
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, purchases } from "@workspace/db";
import { getPaymentProvider } from "@/lib/payments";

export async function POST(req: Request) {
  const rawBody = await req.text();
  // AbacatePay sends the HMAC signature in a header — confirm exact name in docs.
  const signature =
    req.headers.get("x-abacatepay-signature") ?? req.headers.get("x-webhook-signature");
  const event = getPaymentProvider().verifyAndParseWebhook(rawBody, signature);
  if (!event) return NextResponse.json({ error: "invalid" }, { status: 400 });

  if (event.type === "paid") {
    // Mark the matching pending purchase paid (idempotent).
    await db
      .update(purchases)
      .set({ status: "paid", paidAt: new Date() })
      .where(
        and(
          eq(purchases.providerChargeId, event.providerChargeId),
          eq(purchases.status, "pending"),
        ),
      );
    // Fallback: if externalId (userId) is present but no pending row matched
    // (e.g. row lost), upsert a paid purchase so access is granted.
    if (event.externalId) {
      const existing = await db
        .select({ id: purchases.id })
        .from(purchases)
        .where(eq(purchases.providerChargeId, event.providerChargeId))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(purchases).values({
          userId: event.externalId,
          provider: "abacatepay",
          providerChargeId: event.providerChargeId,
          amountCents: 11000,
          currency: "BRL",
          status: "paid",
          paidAt: new Date(),
        });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 10: Typecheck.** `pnpm --filter web typecheck` → passes.

- [ ] **Step 11: Commit**
```bash
git add apps/web/lib/payments apps/web/app/api/payments apps/web/vitest.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add PaymentProvider interface, AbacatePay adapter, checkout + webhook routes"
```

---

## Task 14: Access gating helper + ideas directory page

**Files:**
- Create: `apps/web/lib/access.ts`
- Test: `apps/web/lib/access.test.ts`
- Create: `apps/web/components/idea-card.tsx`, `apps/web/components/locked-teaser.tsx`, `apps/web/components/paywall-cta.tsx`
- Create: `apps/web/app/ideas/page.tsx`

**Interfaces:**
- Produces:
  - `access.ts`: `export function computeAccess(hasPaidPurchase: boolean): { hasFullAccess: boolean }` (pure), `export async function getViewerAccess(): Promise<{ userId: string | null; hasFullAccess: boolean }>` (reads session + purchases).
  - `idea-card.tsx`: `<IdeaCard idea={idea} />` — full card (used for free ideas or paid viewers).
  - `locked-teaser.tsx`: `<LockedTeaser idea={idea} />` — title + niche + blurred metrics, no sensitive fields.

- [ ] **Step 1: Write the failing test for computeAccess**

`apps/web/lib/access.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { computeAccess } from "./access";

describe("computeAccess", () => {
  it("grants full access when a paid purchase exists", () => {
    expect(computeAccess(true)).toEqual({ hasFullAccess: true });
  });
  it("denies full access with no paid purchase", () => {
    expect(computeAccess(false)).toEqual({ hasFullAccess: false });
  });
});
```

- [ ] **Step 2: Run — verify fails.** `pnpm --filter web test access` → FAIL.

- [ ] **Step 3: Implement access.ts**

`apps/web/lib/access.ts`:
```ts
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, purchases } from "@workspace/db";

export function computeAccess(hasPaidPurchase: boolean): { hasFullAccess: boolean } {
  return { hasFullAccess: hasPaidPurchase };
}

export async function getViewerAccess(): Promise<{ userId: string | null; hasFullAccess: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  if (!userId) return { userId: null, hasFullAccess: false };
  const paid = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.status, "paid")))
    .limit(1);
  return { userId, ...computeAccess(paid.length > 0) };
}
```

- [ ] **Step 4: Run — verify passes.** `pnpm --filter web test access` → PASS (2 tests).

- [ ] **Step 5: Write the presentational components**

`apps/web/components/idea-card.tsx`:
```tsx
import Link from "next/link";
import type { Idea } from "@workspace/db";

export function IdeaCard({ idea }: { idea: Idea }) {
  return (
    <Link
      href={`/ideas/${idea.slug}`}
      className="block rounded-lg border p-4 transition hover:border-foreground/40"
    >
      <div className="mb-1 text-xs uppercase text-muted-foreground">{idea.niche}</div>
      <h3 className="font-semibold">{idea.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{idea.oneLiner}</p>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span>Demand {idea.demandScore}/100</span>
        <span>~${idea.mrrLow}–${idea.mrrHigh} MRR</span>
        <span>{idea.askCount} asks</span>
      </div>
    </Link>
  );
}
```

`apps/web/components/locked-teaser.tsx`:
```tsx
import type { Idea } from "@workspace/db";

// Locked teaser: ONLY non-sensitive fields (title, niche) are rendered.
// demandScore / MRR / description are never sent to the client for locked ideas.
export function LockedTeaser({ idea }: { idea: Pick<Idea, "title" | "niche"> }) {
  return (
    <div className="relative rounded-lg border p-4">
      <div className="mb-1 text-xs uppercase text-muted-foreground">{idea.niche}</div>
      <h3 className="font-semibold">{idea.title}</h3>
      <div className="mt-3 space-y-2" aria-hidden>
        <div className="h-3 w-2/3 rounded bg-foreground/10 blur-[2px]" />
        <div className="h-3 w-1/2 rounded bg-foreground/10 blur-[2px]" />
      </div>
      <div className="mt-3 text-xs font-medium text-muted-foreground">🔒 Unlock to view</div>
    </div>
  );
}
```

`apps/web/components/paywall-cta.tsx`:
```tsx
"use client";
import { useState } from "react";

export function PaywallCta({ authenticated }: { authenticated: boolean }) {
  const [loading, setLoading] = useState(false);
  async function buy() {
    setLoading(true);
    const res = await fetch("/api/payments/checkout", { method: "POST" });
    if (res.ok) {
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } else {
      setLoading(false);
      window.location.href = "/account";
    }
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-6 text-center">
      <h2 className="text-lg font-semibold">Unlock every idea — $20 lifetime</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        One payment (PIX ≈ R$110). All current and future ideas, forever.
      </p>
      <button
        onClick={buy}
        disabled={loading}
        className="mt-4 rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {loading ? "Redirecting…" : authenticated ? "Unlock now" : "Sign in to unlock"}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Read modified-Next.js data-fetching/page docs, then write the directory page**

`apps/web/app/ideas/page.tsx`:
```tsx
import { listPublishedIdeas } from "@workspace/db";
import { getViewerAccess } from "@/lib/access";
import { IdeaCard } from "@/components/idea-card";
import { LockedTeaser } from "@/components/locked-teaser";
import { PaywallCta } from "@/components/paywall-cta";

export default async function IdeasPage() {
  const [ideas, access] = await Promise.all([listPublishedIdeas(), getViewerAccess()]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">SaaS demand ideas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sourced from Reddit, Hacker News, Product Hunt and more. Updated weekly.
      </p>

      {!access.hasFullAccess && (
        <div className="my-6">
          <PaywallCta authenticated={access.userId != null} />
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {ideas.map((idea) =>
          access.hasFullAccess || idea.isFree ? (
            <IdeaCard key={idea.id} idea={idea} />
          ) : (
            // Only title + niche cross the wire for locked ideas.
            <LockedTeaser key={idea.id} idea={{ title: idea.title, niche: idea.niche }} />
          ),
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Typecheck.** `pnpm --filter web typecheck` → passes.

- [ ] **Step 8: Commit**
```bash
git add apps/web/lib/access.ts apps/web/lib/access.test.ts apps/web/components apps/web/app/ideas/page.tsx
git commit -m "feat(web): add access gating, ideas directory, and paywall teasers"
```

---

## Task 15: Idea detail page (server-gated)

**Files:**
- Create: `apps/web/app/ideas/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getPublishedIdeaBySlug`, `getEvidenceForIdea` from `@workspace/db`; `getViewerAccess` from `@/lib/access`.

> The whole point of gating server-side: for a locked idea, a non-paying viewer must NEVER receive the description, MRR, evidence, or validation signals in the response. Redirect or render the paywall instead.

- [ ] **Step 1: Read modified-Next.js dynamic-route + notFound docs**

Confirm the params shape (`params` may be a Promise in this Next.js version) and the `notFound()` import path.

- [ ] **Step 2: Write the detail page**

`apps/web/app/ideas/[slug]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublishedIdeaBySlug, getEvidenceForIdea } from "@workspace/db";
import { getViewerAccess } from "@/lib/access";
import { PaywallCta } from "@/components/paywall-cta";

export default async function IdeaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const idea = await getPublishedIdeaBySlug(slug);
  if (!idea) notFound();

  const access = await getViewerAccess();
  const locked = !access.hasFullAccess && !idea.isFree;

  if (locked) {
    // Server-side gate: send ONLY title + niche; everything else stays on the server.
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/ideas" className="text-sm text-muted-foreground">← All ideas</Link>
        <div className="mb-1 mt-4 text-xs uppercase text-muted-foreground">{idea.niche}</div>
        <h1 className="text-2xl font-bold">{idea.title}</h1>
        <p className="mt-2 text-muted-foreground">
          This idea is locked. Unlock the full database to see the demand evidence, sources,
          MRR estimate, and validation signals.
        </p>
        <div className="mt-6">
          <PaywallCta authenticated={access.userId != null} />
        </div>
      </main>
    );
  }

  const evidence = await getEvidenceForIdea(idea.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/ideas" className="text-sm text-muted-foreground">← All ideas</Link>
      <div className="mb-1 mt-4 text-xs uppercase text-muted-foreground">{idea.niche}</div>
      <h1 className="text-2xl font-bold">{idea.title}</h1>
      <p className="mt-1 text-lg text-muted-foreground">{idea.oneLiner}</p>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <span>Demand: {idea.demandScore}/100</span>
        <span>Asks: {idea.askCount}</span>
        <span>Est. MRR: ${idea.mrrLow}–${idea.mrrHigh}/mo</span>
      </div>

      <section className="mt-6">
        <h2 className="font-semibold">The opportunity</h2>
        <p className="mt-1 whitespace-pre-line text-sm">{idea.description}</p>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">MRR estimate</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ${idea.mrrLow}–${idea.mrrHigh}/mo is a conservative estimate derived from audience-size
          signals, a plausible price point, and a low conversion assumption. Treat it as a
          directional range, not a forecast.
        </p>
      </section>

      {idea.competitionNotes && (
        <section className="mt-6">
          <h2 className="font-semibold">Competition</h2>
          <p className="mt-1 text-sm">{idea.competitionNotes}</p>
        </section>
      )}

      {idea.validationSignals.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Validation signals</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {idea.validationSignals.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-semibold">Sources ({evidence.length})</h2>
        <ul className="mt-2 space-y-2">
          {evidence.map((p) => (
            <li key={p.id} className="text-sm">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline">
                [{p.source}] {p.title ?? p.content.slice(0, 80)}
              </a>
              {p.postedAt && (
                <span className="ml-2 text-muted-foreground">
                  {p.postedAt.toISOString().slice(0, 10)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck.** `pnpm --filter web typecheck` → passes.

- [ ] **Step 4: Commit**
```bash
git add apps/web/app/ideas/\[slug\]/page.tsx
git commit -m "feat(web): add server-gated idea detail page"
```

---

## Task 16: Admin page (draft review + publish)

**Files:**
- Create: `apps/web/lib/admin.ts`
- Test: `apps/web/lib/admin.test.ts`
- Create: `apps/web/app/admin/actions.ts`, `apps/web/app/admin/page.tsx`

**Interfaces:**
- Produces:
  - `admin.ts`: `export function isAdmin(userId: string | null, adminIds: string): boolean` (pure — `adminIds` is comma-separated env value), `export async function requireAdmin(): Promise<string>` (throws/redirects if not admin).
  - `actions.ts`: server actions `publishIdea(formData)`, `setFreeIdea(formData)`, `unpublishIdea(formData)`.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/admin.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isAdmin } from "./admin";

describe("isAdmin", () => {
  it("matches a user id in the comma-separated allowlist", () => {
    expect(isAdmin("u2", "u1,u2,u3")).toBe(true);
  });
  it("rejects a non-listed id", () => {
    expect(isAdmin("u9", "u1,u2")).toBe(false);
  });
  it("rejects null and empty allowlist", () => {
    expect(isAdmin(null, "u1")).toBe(false);
    expect(isAdmin("u1", "")).toBe(false);
  });
  it("tolerates spaces around ids", () => {
    expect(isAdmin("u2", "u1, u2 , u3")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify fails.** `pnpm --filter web test admin` → FAIL.

- [ ] **Step 3: Implement admin.ts**

`apps/web/lib/admin.ts`:
```ts
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export function isAdmin(userId: string | null, adminIds: string): boolean {
  if (!userId) return false;
  const set = adminIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return set.includes(userId);
}

export async function requireAdmin(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  if (!isAdmin(userId, process.env.ADMIN_USER_IDS ?? "")) {
    throw new Error("forbidden");
  }
  return userId!;
}
```

- [ ] **Step 4: Run — verify passes.** `pnpm --filter web test admin` → PASS (4 tests).

- [ ] **Step 5: Read modified-Next.js server-actions docs, then write actions.ts**

`apps/web/app/admin/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, ideas } from "@workspace/db";
import { requireAdmin } from "@/lib/admin";

export async function publishIdea(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db
    .update(ideas)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(ideas.id, id));
  revalidatePath("/admin");
  revalidatePath("/ideas");
}

export async function unpublishIdea(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db.update(ideas).set({ status: "draft" }).where(eq(ideas.id, id));
  revalidatePath("/admin");
  revalidatePath("/ideas");
}

export async function setFreeIdea(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const isFree = formData.get("isFree") === "true";
  await db.update(ideas).set({ isFree }).where(eq(ideas.id, id));
  revalidatePath("/admin");
  revalidatePath("/ideas");
}
```

- [ ] **Step 6: Write the admin page**

`apps/web/app/admin/page.tsx`:
```tsx
import { desc } from "drizzle-orm";
import { db, ideas } from "@workspace/db";
import { requireAdmin } from "@/lib/admin";
import { publishIdea, unpublishIdea, setFreeIdea } from "./actions";

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch {
    return <main className="p-10">Forbidden.</main>;
  }

  const rows = await db.select().from(ideas).orderBy(desc(ideas.createdAt)).limit(200);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Admin — idea review</h1>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Title</th>
            <th>Niche</th>
            <th>Score</th>
            <th>Status</th>
            <th>Free</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((idea) => (
            <tr key={idea.id} className="border-b align-top">
              <td className="py-2 font-medium">{idea.title}</td>
              <td>{idea.niche}</td>
              <td>{idea.demandScore}</td>
              <td>{idea.status}</td>
              <td>{idea.isFree ? "yes" : "no"}</td>
              <td className="space-x-2 py-2">
                {idea.status === "draft" ? (
                  <form action={publishIdea} className="inline">
                    <input type="hidden" name="id" value={idea.id} />
                    <button className="rounded bg-foreground px-2 py-1 text-xs text-background">
                      Publish
                    </button>
                  </form>
                ) : (
                  <form action={unpublishIdea} className="inline">
                    <input type="hidden" name="id" value={idea.id} />
                    <button className="rounded border px-2 py-1 text-xs">Unpublish</button>
                  </form>
                )}
                <form action={setFreeIdea} className="inline">
                  <input type="hidden" name="id" value={idea.id} />
                  <input type="hidden" name="isFree" value={idea.isFree ? "false" : "true"} />
                  <button className="rounded border px-2 py-1 text-xs">
                    {idea.isFree ? "Unset free" : "Mark free"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 7: Typecheck.** `pnpm --filter web typecheck` → passes.

- [ ] **Step 8: Commit**
```bash
git add apps/web/lib/admin.ts apps/web/lib/admin.test.ts apps/web/app/admin
git commit -m "feat(web): add admin draft review and publish workflow"
```

---

## Task 17: Landing page + account page + verify full build

**Files:**
- Modify: `apps/web/app/page.tsx` (replace starter)
- Create: `apps/web/app/account/page.tsx`
- Create: `apps/web/components/auth-buttons.tsx`

**Interfaces:**
- Consumes: `getViewerAccess`, `authClient`.

- [ ] **Step 1: Read the current starter page**

Read `apps/web/app/page.tsx` and `apps/web/app/layout.tsx` to match existing styling/providers before replacing.

- [ ] **Step 2: Write auth-buttons.tsx**

`apps/web/components/auth-buttons.tsx`:
```tsx
"use client";
import { useState } from "react";
import { signIn, signOut, useSession } from "@/lib/auth-client";

export function AuthButtons() {
  const { data: session } = useSession();
  const [email, setEmail] = useState("");

  if (session?.user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{session.user.email}</span>
        <button onClick={() => signOut()} className="underline">Sign out</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button
        onClick={() => signIn.social({ provider: "google", callbackURL: "/ideas" })}
        className="rounded-md border px-4 py-2 text-sm"
      >
        Continue with Google
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          signIn.magicLink({ email, callbackURL: "/ideas" });
        }}
        className="flex gap-2"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="rounded-md border px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-foreground px-4 py-2 text-sm text-background">
          Email me a link
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Replace the landing page**

`apps/web/app/page.tsx`:
```tsx
import Link from "next/link";
import { AuthButtons } from "@/components/auth-buttons";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">
        Validated SaaS ideas, mined from real demand.
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        We scan Reddit, Hacker News, Product Hunt and more every week for people asking for
        products that don&apos;t exist yet — then rank them by demand, sources, ask counts, and a
        conservative MRR estimate.
      </p>
      <ul className="mt-6 space-y-1 text-sm text-muted-foreground">
        <li>• 5 ideas free. The full database is $20 — one payment, lifetime access.</li>
        <li>• Every idea links to the exact posts that prove the demand.</li>
        <li>• New ideas added weekly. Lifetime buyers get all of them.</li>
      </ul>
      <div className="mt-8 flex flex-col gap-4">
        <Link
          href="/ideas"
          className="w-fit rounded-md bg-foreground px-6 py-3 font-medium text-background"
        >
          Browse the ideas →
        </Link>
        <AuthButtons />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Write the account page**

`apps/web/app/account/page.tsx`:
```tsx
import Link from "next/link";
import { getViewerAccess } from "@/lib/access";
import { AuthButtons } from "@/components/auth-buttons";
import { PaywallCta } from "@/components/paywall-cta";

export default async function AccountPage() {
  const access = await getViewerAccess();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Your account</h1>

      {!access.userId ? (
        <div className="mt-6">
          <p className="text-muted-foreground">Sign in to manage your access.</p>
          <div className="mt-4">
            <AuthButtons />
          </div>
        </div>
      ) : access.hasFullAccess ? (
        <div className="mt-6 rounded-lg border bg-muted/30 p-6">
          <p className="font-medium">✓ Lifetime access active</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can see every current and future idea.
          </p>
          <Link href="/ideas" className="mt-4 inline-block underline">
            Go to the ideas →
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-muted-foreground">You&apos;re on the free plan (5 ideas).</p>
          <div className="mt-4">
            <PaywallCta authenticated />
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Full build + typecheck + all tests**

Run:
```bash
pnpm --filter web typecheck
pnpm -w test
pnpm --filter web build
```
Expected: typecheck passes; all package tests pass; `next build` completes without errors. If `pnpm -w test` isn't defined at the root, run `pnpm --filter @workspace/pipeline test && pnpm --filter @workspace/db test && pnpm --filter web test`.

- [ ] **Step 6: Commit**
```bash
git add apps/web/app/page.tsx apps/web/app/account/page.tsx apps/web/components/auth-buttons.tsx
git commit -m "feat(web): add landing page, account page, and auth buttons"
```

---

## Post-implementation setup (documented, not code tasks)

These are one-time operational steps the owner performs — list them in a `README` note during Task 17 or a follow-up:

1. Create a Neon project; set `DATABASE_URL`. Run `pnpm --filter @workspace/db db:migrate` and enable pg_trgm (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`) once.
2. Create a Google OAuth client; set `GOOGLE_CLIENT_ID`/`SECRET` and the redirect URI to `<app>/api/auth/callback/google`.
3. Create a Resend account + verified sender; set `RESEND_API_KEY`, `EMAIL_FROM`.
4. Create an AbacatePay account; set `ABACATEPAY_API_KEY`; register the webhook at `<app>/api/payments/webhook` with a secret → `ABACATEPAY_WEBHOOK_SECRET`; subscribe to `checkout.completed`.
5. Add all GitHub Actions secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`, optional scraper cookies/token) and repo vars (`SOURCE_*`).
6. Deploy `apps/web` to Vercel; set all env vars including `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` to the production URL. Set `ADMIN_USER_IDS` to your own user id (read from the `user` table after first sign-in).

---

## Self-Review Notes

- **Spec coverage:** pipeline adapters (Tasks 3–6), swappable interface + registry (Task 2, Task 10 `ADAPTERS`), dedupe/cluster/enrich (Tasks 7–10), pg_trgm matching (Task 9), MRR-as-labeled-estimate (Task 15 copy), weekly GH Actions + failure issue + run report (Task 10), Neon/Drizzle schema (Task 1), 5 free + locked server-side gating (Tasks 14–15), Better Auth Google+magic-link (Task 12), AbacatePay behind `PaymentProvider` (Task 13), admin QA (Task 16), landing/account (Task 17), ~$5/mo cost cap (Task 8 client + Task 10 abort). All spec sections map to tasks.
- **Modified Next.js:** every web task instructs reading `node_modules/next/dist/docs/` before writing; params typed as `Promise` per Next 16.
- **Cost cap** is enforced in `run.ts` by checking `client.spentMillicents` before each expensive Haiku stage.
