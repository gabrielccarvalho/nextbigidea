import { chromium, type Browser } from "playwright";

export async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

// Parse a "name=value; name2=value2" cookie string into Playwright cookie objects
// scoped to a domain. Session cookies come from Actions secrets.
export function cookiesFor(domain: string, cookieString: string) {
  return cookieString
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return {
        name: pair.slice(0, eq),
        value: pair.slice(eq + 1),
        domain,
        path: "/",
      };
    });
}
