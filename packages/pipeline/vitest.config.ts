import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // normalize.ts imports `db` from @workspace/db at module scope, and that
    // client throws synchronously if DATABASE_URL is unset. No test here
    // actually issues a query (upsertRawPosts is DB-integration, out of scope
    // for this suite), so a syntactically-valid placeholder is enough to let
    // the module load without connecting to anything real.
    env: { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test" },
  },
});
