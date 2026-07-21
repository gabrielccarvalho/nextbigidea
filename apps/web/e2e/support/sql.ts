import { required } from "./env";

/**
 * Direct SQL access for seeding and asserting, over the same local Neon HTTP proxy the app's
 * read driver uses (see docker-compose.yml).
 *
 * Why not import `@workspace/db`: Playwright's TypeScript transform does not apply to files
 * under node_modules, and the workspace package is consumed as symlinked *source* TS. Talking
 * to the proxy over `fetch` keeps the harness dependency-free and, incidentally, verifies the
 * proxy the app itself depends on is actually up.
 */
export async function sql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const endpoint = `http://${process.env.NEON_LOCAL_HTTP_HOST ?? "localhost:4444"}/sql`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "neon-connection-string": required("DATABASE_URL"),
        "neon-raw-text-output": "true",
        "neon-array-mode": "false",
      },
      body: JSON.stringify({ query, params }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach the local Neon HTTP proxy at ${endpoint}. Start the stack with ` +
        `\`docker compose up -d\` from the repo root. Cause: ${(err as Error).message}`,
    );
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}\n  query: ${query}`);
  return (JSON.parse(text) as { rows: T[] }).rows;
}
