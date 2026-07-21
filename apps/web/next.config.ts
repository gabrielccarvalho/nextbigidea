import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/db"],
  // Next 16 allows only ONE `next dev` per build directory — a second one exits with
  // "Another next dev server is already running", no matter which port it was given. The E2E
  // suite starts its own dev server, so without this it cannot run at all while `pnpm dev` is
  // up. Overriding the build directory gives that server its own lock and lets the two coexist.
  // Unset everywhere else, so normal development and production builds still use `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
}

export default nextConfig
