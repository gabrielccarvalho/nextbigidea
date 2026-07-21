import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadEnv, required, STORAGE_STATE } from "./support/env";
import { cleanup, seedLockedIdea, seedUserAndSession } from "./support/seed";

export default async function globalSetup() {
  loadEnv();
  // Fail fast and legibly rather than deep inside a test.
  required("DATABASE_URL");
  required("BETTER_AUTH_SECRET");
  required("ABACATEPAY_API_KEY");
  required("ABACATEPAY_PRODUCT_ID");
  required("ABACATEPAY_WEBHOOK_SECRET");

  await cleanup();
  const { cookieName, cookieValue } = await seedUserAndSession();
  await seedLockedIdea();

  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  writeFileSync(
    STORAGE_STATE,
    JSON.stringify(
      {
        cookies: [
          {
            name: cookieName,
            value: cookieValue,
            domain: "localhost",
            path: "/",
            expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
      null,
      2,
    ),
  );
}
