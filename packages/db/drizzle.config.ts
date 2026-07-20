import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// drizzle-kit sees @neondatabase/serverless in this package's dependencies and picks the Neon
// WebSocket driver regardless of the URL, so pointing DATABASE_URL at a local container is not
// enough — the driver still tries to open a TLS WebSocket to it and hangs. Route it through the
// local wsproxy from docker-compose.yml instead. Opt-in, so CI and production migrations against
// real Neon are untouched.
if (process.env.NEON_LOCAL_PROXY === "true") {
  neonConfig.webSocketConstructor = ws;
  neonConfig.wsProxy = () => `${process.env.NEON_LOCAL_WS_HOST ?? "localhost:4445"}/v1`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
