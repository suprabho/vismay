/**
 * Polite HTML fetch shared by every theanalyst.com scraper (news, power
 * rankings, match centre, match discovery).
 *
 * theanalyst.com is the one approved scraping exception to the RSS-only news
 * policy (see docs/theanalyst-scraping.md), so this module is deliberately
 * conservative: a descriptive User-Agent with a contact address, a fixed
 * courtesy delay between requests, and hard failures on anything that isn't
 * an HTML 2xx so a blocked/redirected response never gets parsed as content.
 *
 * Three ways to reach a page, verified against the live site:
 *   - `fetchHtml` — plain fetch. Works for the article listing/pages
 *     (theanalyst/news.ts): they're server-rendered.
 *   - `fetchRenderedHtml` — headless Chromium (Playwright), returns the
 *     rendered DOM as a string once. The Power Rankings ranked list and the
 *     match-centre stats widget are client-rendered, so plain fetch returns
 *     a shell with none of the data cheerio needs; used by
 *     theanalyst/powerRankings.ts and theanalyst/matchCentre.ts.
 *   - `newRenderedPage` — headless Chromium, hands back a live `Page` for
 *     multi-step interaction (clicks, waits) instead of one final HTML
 *     snapshot. theanalyst/matchDiscovery.ts needs this: the fixtures
 *     listing's date picker only reveals a given day's matches after you
 *     click that day's calendar cell — there's no URL that shows a whole
 *     competition's fixture history in one page.
 */

import { chromium, type Browser, type Page } from 'playwright';

export const USER_AGENT = 'Footshorts/1.0 (theanalyst ingest; hello@promad.design)';

// Courtesy crawl delay between consecutive requests within one run. robots.txt
// couldn't be checked when this was written — if it declares a Crawl-delay,
// raise this to match (docs/theanalyst-scraping.md, verification checklist).
const CRAWL_DELAY_MS = 1000;

let lastFetchAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtml(url: string): Promise<string> {
  const wait = lastFetchAt + CRAWL_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
  });
  if (!res.ok) {
    throw new Error(`theanalyst fetch ${res.status}: ${res.statusText} (${url})`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    throw new Error(`theanalyst fetch returned ${contentType || 'no content-type'} — expected HTML (${url})`);
  }

  return res.text();
}

// One Chromium instance per process, reused across every headless fetch in a
// run (power rankings + discovery + N match-centre scrapes). Entry scripts
// must call closeBrowser() before exiting or the process hangs open.
let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
  // Just assigned above if it was null — narrowing doesn't survive across
  // the closure boundary for a module-level `let`.
  return browserPromise!;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

/**
 * Headless fetch for theanalyst.com pages whose content is client-rendered.
 *
 * When `waitForSelector` is given, waits for that selector to appear —
 * reliable for a page whose data widget keeps polling after it's rendered
 * (verified against the live Power Rankings widget: `networkidle` alone is
 * flaky there because the ticker never goes fully quiet). Without a
 * selector, falls back to waiting for network activity to settle, which is
 * fine for a normal server-first page that only needs a settle window
 * (falls through on timeout either way — callers throw their own "no data
 * found" error if the DOM comes back empty).
 */
export async function fetchRenderedHtml(
  url: string,
  opts?: { timeoutMs?: number; waitForSelector?: string }
): Promise<string> {
  const wait = lastFetchAt + CRAWL_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();

  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: USER_AGENT });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (opts?.waitForSelector) {
      await page.waitForSelector(opts.waitForSelector, { timeout: opts.timeoutMs ?? 15_000 }).catch(() => {});
    } else {
      await page.waitForLoadState('networkidle', { timeout: opts?.timeoutMs ?? 15_000 }).catch(() => {});
    }
    return await page.content();
  } finally {
    await context.close();
  }
}

/**
 * Headless Chromium for multi-step interaction (clicks, waits) rather than a
 * single rendered snapshot. Caller MUST call the returned `close()` when
 * done — it closes the context, not the shared browser (see closeBrowser).
 * Applies the same courtesy delay as the other two fetch modes for the
 * initial navigation; subsequent in-page interaction (clicking a calendar
 * cell, etc.) is a same-context request and isn't separately throttled.
 */
export async function newRenderedPage(): Promise<{ page: Page; close: () => Promise<void> }> {
  const wait = lastFetchAt + CRAWL_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();

  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}
