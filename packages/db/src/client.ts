import { neon, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleWebSocket } from "drizzle-orm/neon-serverless";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = neon(url);
export const db = drizzle({ client: sql, schema });
export { schema };

// --- Transactional client ---
//
// `db` above uses the neon-http driver, which sends each statement as an independent HTTP
// request. That driver CANNOT open a transaction: drizzle's neon-http session implements
// `transaction()` as `throw new Error("No transactions support in neon-http driver")`. It
// typechecks fine and fails 100% of the time at runtime, so any code path that needs BEGIN/COMMIT
// (read-then-write under a row lock, multi-row updates that must land together) must use this
// client instead, which speaks the real Postgres protocol over a WebSocket and supports
// transactions, `FOR UPDATE`, and advisory locks.
//
// Kept separate and lazy on purpose: the http client is cheaper and correct for the read-only and
// single-statement writes that make up the rest of the app, and building a Pool at import time
// would make every consumer of this package (including test files) pay for a connection pool they
// never use.
let pool: Pool | undefined;
let txDb: NeonDatabase<typeof schema> | undefined;

/**
 * The transaction-capable database handle. Use ONLY where a transaction is actually required —
 * `db` remains the default. Requires a WebSocket implementation; Node 18+ provides one globally,
 * which is what the Next.js server runtime uses.
 */
export function getTransactionalDb(): NeonDatabase<typeof schema> {
  if (!txDb) {
    pool = new Pool({ connectionString: url });
    txDb = drizzleWebSocket({ client: pool, schema });
  }
  return txDb;
}
