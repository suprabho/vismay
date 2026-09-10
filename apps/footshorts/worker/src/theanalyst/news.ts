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
 * VERIFIED LIVE (2026-09-09) against the per-competition article listings
 * (`/competition/<slug>/articles`, e.g. uefa-champions-league, premier-league):
 * they're server-rendered WordPress pages. Each article is an
 * `<article class="teaser">` card inside `<main class="posts-wrapper">` with
 * an `a.teaser-content-link` (href) wrapping `h3.teaser-title`, a
 * `time[datetime]`, and a `.pill` linking back to the competition listing.
 * `listArticleLinks` reads those cards first so the site's nav/footer links
 * (NBA, predictions, FPL, the Power Rankings explainer — all under
 * `/articles/<slug>` too) don't get pulled into a football-competition
 * source's run; it falls back to a page-wide `/articles/<slug>` scan if the
 * card markup ever disappears, so a redesign degrades to "noisier" rather
 * than "empty". Everything page-structure-dependent is isolated in this file
 * on purpose (docs/theanalyst-scraping.md fragility table).
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

/** Listing-card selectors, verified live 2026-09-09 (see module doc). */
const CARD_SELECTOR = 'main.posts-wrapper article.teaser, main article.teaser';
const CARD_LINK_SELECTOR = 'a.teaser-content-link[href], a.thumbnail-link[href]';
const CARD_TITLE_SELECTOR = '.teaser-title';

function canonicalArticleUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN || !ARTICLE_PATH_RE.test(url.pathname)) return null;
  return `${ORIGIN}${url.pathname.replace(/\/$/, '')}`;
}

export async function listArticleLinks(listingUrl: string): Promise<ArticleLink[]> {
  const html = await fetchHtml(listingUrl);
  const $ = cheerio.load(html);

  const seen = new Set<string>();
  const links: ArticleLink[] = [];

  // 1. Listing cards — the listing's own content, nothing from site chrome.
  $(CARD_SELECTOR).each((_, card) => {
    const $card = $(card);
    const href = $card.find(CARD_LINK_SELECTOR).first().attr('href');
    if (!href) return;
    const canonical = canonicalArticleUrl(href);
    if (!canonical || seen.has(canonical)) return;

    const headline =
      $card.find(CARD_TITLE_SELECTOR).first().text().replace(/\s+/g, ' ').trim() ||
      $card.find('img[alt]').first().attr('alt')?.replace(/\s+/g, ' ').trim() ||
      '';
    if (!headline) return;

    seen.add(canonical);
    links.push({ url: canonical, headline });
  });
  if (links.length > 0) return links;

  // 2. Fallback: any /articles/<slug> link on the page (pre-2026-09 behaviour).
  // Only reached if the card markup changed — noisier (nav/footer links
  // included) but never silently empty.
  console.warn(`[theanalyst] no listing cards found at ${listingUrl} — falling back to page-wide link scan`);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const canonical = canonicalArticleUrl(href);
    if (!canonical || seen.has(canonical)) return;

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
  // og:title carries a "… | Opta Analyst" site suffix (verified 2026-09-09);
  // the feed shows the publisher separately, so drop it.
  const title = (
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().replace(/\s+/g, ' ').trim() ||
    $('title').text().replace(/\s+/g, ' ').trim()
  ).replace(/\s*\|\s*(The\s+)?(Opta\s+)?Analyst\s*$/i, '');
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
