/**
 * Polite HTML fetch shared by every theanalyst.com scraper (news, power
 * rankings, match centre, match discovery).
 *
 * theanalyst.com is the one approved scraping exception to the RSS-only news
 * policy (see docs/theanalyst-scraping.md), so this module is deliberately
 * conservative: a descriptive User-Agent with a contact address, a fixed
 * courtesy delay between requests, and hard failures on anything that isn't
 * an HTML 2xx so a blocked/redirected response never gets parsed as content.
 */

const USER_AGENT = 'Footshorts/1.0 (theanalyst ingest; hello@promad.design)';

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
