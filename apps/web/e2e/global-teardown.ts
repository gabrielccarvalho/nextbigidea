import { loadEnv } from "./support/env";
import { cleanup } from "./support/seed";

export default async function globalTeardown() {
  loadEnv();
  await cleanup();
}
