import type { PipelineEnv, RawPost, SourceAdapter } from "../types";
import { cookiesFor, withBrowser } from "./browser";

const SEARCH = 'https://x.com/search?q=%22i%20wish%20there%20was%20an%20app%22&f=live';

export const xAdapter: SourceAdapter = {
  name: "x",
  enabled: (env) => env.sources.x && !!env.xSessionCookie,
  async fetchPosts(_since: Date, env: PipelineEnv): Promise<RawPost[]> {
    const cookie = env.xSessionCookie;
    if (!cookie) throw new Error("X_SESSION_COOKIE missing");
    return withBrowser(async (browser) => {
      const ctx = await browser.newContext();
      await ctx.addCookies(cookiesFor(".x.com", cookie));
      const page = await ctx.newPage();
      await page.goto(SEARCH, { waitUntil: "networkidle", timeout: 30_000 });
      const articles = await page.locator("article").all();
      const out: RawPost[] = [];
      for (const a of articles.slice(0, 50)) {
        const text = (await a.innerText().catch(() => "")).trim();
        const href = await a.locator('a[href*="/status/"]').first().getAttribute("href").catch(() => null);
        if (!href || !text) continue;
        const id = href.split("/status/")[1]?.split(/[/?]/)[0];
        if (!id) continue;
        out.push({
          source: "x",
          sourcePostId: id,
          url: `https://x.com${href}`,
          content: text,
          metrics: {},
        });
      }
      if (out.length === 0) throw new Error("x scrape returned 0 posts (layout changed or blocked)");
      return out;
    });
  },
};
