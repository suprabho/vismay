/**
 * theanalyst.com general-news scraper.
 *
 * Two steps, mirroring what rss-parser gives us for feed sources:
 *   1. listArticleLinks — collect article URLs from a listing/index page.
 *   2. fetchArticleBody — extract the visible text of one article, which then
 *      flows into the SAME summarize/entity-tag pipeline as RSS items
 *      (ingest.ts). We never store or republish the full text — it's Gemini
 *      input only, and the stored summary always links back to the source.
 *
 * SELECTOR CAVEAT: written without network access to theanalyst.com, so the
 * link-collection heuristics below are based on the site's known URL shape
 * (/articles/<slug>) rather than verified DOM. Verify against the live site
 * before production (docs/theanalyst-scraping.md checklist) — everything
 * page-structure-dependent is isolated in this file on purpose.
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetch';

export type ArticleLink = {
  url: string;
  headline: string;
};

export type ArticleBody = {
  title: string;
  body: string;
  publishedAt: string | null;
  imageUrl: string | null;
};

const ORIGIN = 'https://theanalyst.com';

/** Article pages live under /articles/<slug>. */
const ARTICLE_PATH_RE = /^\/articles\/[a-z0-9-]+\/?$/;

export async function listArticleLinks(listingUrl: string): Promise<ArticleLink[]> {
  const html = await fetchHtml(listingUrl);
  const $ = cheerio.load(html);

  const seen = new Set<string>();
  const links: ArticleLink[] = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    let url: URL;
    try {
      url = new URL(href, ORIGIN);
    } catch {
      return;
    }
    if (url.origin !== ORIGIN || !ARTICLE_PATH_RE.test(url.pathname)) return;

    const canonical = `${ORIGIN}${url.pathname.replace(/\/$/, '')}`;
    if (seen.has(canonical)) return;

    // Use the link text as a provisional headline; fetchArticleBody replaces it
    // with the page's own <h1>/<title> when the article is actually ingested.
    const headline = $(el).text().replace(/\s+/g, ' ').trim();
    if (!headline) return;

    seen.add(canonical);
    links.push({ url: canonical, headline });
  });

  return links;
}

export async function fetchArticleBody(url: string): Promise<ArticleBody> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // Metadata first, from tags that survive redesigns better than CSS classes.
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().replace(/\s+/g, ' ').trim() ||
    $('title').text().replace(/\s+/g, ' ').trim();
  const publishedAt =
    $('meta[property="article:published_time"]').attr('content')?.trim() ||
    $('time[datetime]').first().attr('datetime')?.trim() ||
    null;
  const imageUrl = $('meta[property="og:image"]').attr('content')?.trim() || null;

  // Body text: same strip-boilerplate approach as squads/adapters/press-release.ts.
  $('script, style, nav, header, footer, noscript, aside, form').remove();
  const root = $('article').length ? $('article') : $('main').length ? $('main') : $('body');
  const body = root.text().replace(/\s+/g, ' ').trim();

  if (!title || body.length < 200) {
    throw new Error(`theanalyst article yielded no usable text — JS-rendered or selector drift? (${url})`);
  }

  return { title, body, publishedAt, imageUrl };
}
