import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
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
let txDb: NeonDatabase<typeof schema> | undefined;

/**
 * The transaction-capable database handle. Use ONLY where a transaction is actually required —
 * `db` remains the default.
 *
 * The Pool speaks the Postgres wire protocol over a WebSocket, so it needs a WebSocket
 * implementation. Do NOT rely on a global one: Node put `globalThis.WebSocket` behind
 * `--experimental-websocket` in 20.10 and only unflagged it in 22.4, while this repo's `engines`
 * allows `>=20` and CI pins Node 20 — the global would be `undefined` there and EVERY webhook
 * would 500. Injecting `ws` (Neon's documented approach) makes this work on any supported Node
 * rather than only on whichever version the developer happens to run.
 */
export function getTransactionalDb(): NeonDatabase<typeof schema> {
  if (!txDb) {
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: url });
    // `pg.Pool` (which Neon's Pool extends) is an EventEmitter that emits `'error'` when an IDLE
    // client fails — e.g. Neon dropping a connection between webhooks. An EventEmitter with no
    // `'error'` listener THROWS, and because that throw originates outside any request it becomes
    // an uncaught exception that takes down the whole Next.js process, not just one request.
    // Logging here keeps a dropped idle connection to what it actually is: a pooled client the
    // pool will replace on the next checkout.
    pool.on("error", (err) => {
      console.error("[db] idle client error on the transactional pool:", err);
    });
    txDb = drizzleWebSocket({ client: pool, schema });
  }
  return txDb;
}
