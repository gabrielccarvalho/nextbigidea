import { createHash } from "node:crypto";
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
      for (const el of posts.slice(0, 40)) {
        const text = (await el.innerText().catch(() => "")).trim();
        const urn = await el.getAttribute("data-urn").catch(() => null);
        if (!text) continue;
        // Prefer LinkedIn's own stable URN. When it's missing, derive the id
        // deterministically from the post text so the SAME post yields the SAME
        // id on every run. A run-varying id (Date.now(), array index) would
        // defeat the (source, source_post_id) unique index and re-insert the
        // post every week, inflating ask_count and corrupting demand signal.
        const id = urn ?? `linkedin-sha-${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
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
