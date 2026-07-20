import "dotenv/config";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Applies the migrations in ./drizzle.
 *
 * `drizzle-kit migrate` cannot be used against the local Docker stack: it bundles
 * drizzle.config.ts through esbuild and instantiates the Neon driver in its own module registry,
 * so the `neonConfig` mutations that redirect traffic to the local wsproxy never reach the driver
 * it actually uses, and it hangs trying to open a TLS WebSocket to a plain Postgres container.
 *
 * Running the migrator in-process keeps the same drizzle journal table (`__drizzle_migrations`)
 * and the same migration files, while letting the proxy configuration apply. Against real Neon
 * this behaves identically to `drizzle-kit migrate` — NEON_LOCAL_PROXY simply stays unset.
 */
neonConfig.webSocketConstructor = ws;
if (process.env.NEON_LOCAL_PROXY === "true") {
  neonConfig.wsProxy = () => `${process.env.NEON_LOCAL_WS_HOST ?? "localhost:4445"}/v1`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

const pool = new Pool({ connectionString: url });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder });
  console.log(`migrations applied from ${migrationsFolder}`);
} finally {
  await pool.end();
}
