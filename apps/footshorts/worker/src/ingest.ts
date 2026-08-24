/**
 * Ingestion pipeline.
 *
 * Flow:
 *   1. For each RSS source, fetch + parse; for each scrape source (theanalyst —
 *      the one approved non-RSS exception, see sources.ts), fetch the listing
 *      page and pull new article pages
 *   2. For each item, compute url_hash; skip if already in DB
 *   3. Insert row with status='pending'
 *   4. Call Gemini for summary + entities
 *   5. Map Gemini's free-text entity names to canonical entity IDs
 *   6. Update row with summary + link article_entities
 *
 * Both source kinds converge on processCandidateArticle() — steps 2-6 are
 * identical regardless of how the article text was obtained.
 *
 * Run via: `npm run ingest` (one-shot) or schedule via cron
 */

import Parser from 'rss-parser';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { RSS_SOURCES, RssSource, SCRAPE_SOURCES, ScrapeSource } from './sources';
import { summarizeAndTag } from './gemini';
import { resolveEntities } from './entityResolver';
import { listArticleLinks, fetchArticleBody } from './theanalyst/news';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const parser = new Parser({
  headers: {
    'User-Agent': 'Footshorts/1.0 (+https://footshorts.app)',
  },
  timeout: 10000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
    ],
  },
});

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

type IngestStats = { fetched: number; new: number; hidden: number; errors: number };

/** One article ready for steps 2-6, whichever source kind produced it. */
type CandidateArticle = {
  url: string;
  headline: string;
  publisher: string;
  /** Full text / description handed to Gemini. Never stored verbatim. */
  body: string;
  /** Short original snippet stored on the row (RSS description). */
  snippet: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
};

async function isKnownUrl(urlHash: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('articles')
    .select('id')
    .eq('url_hash', urlHash)
    .maybeSingle();
  return Boolean(existing);
}

/**
 * Steps 2-6 for a single article: dedupe → insert pending → summarize + tag →
 * entity-link → status update. Mutates `stats`; `sourceId` is only for logs.
 */
async function processCandidateArticle(
  sourceId: string,
  candidate: CandidateArticle,
  stats: IngestStats
): Promise<void> {
  const urlHash = hashUrl(candidate.url);
  if (await isKnownUrl(urlHash)) return;

  // Insert pending row
  const { data: inserted, error: insertError } = await supabase
    .from('articles')
    .insert({
      url: candidate.url,
      url_hash: urlHash,
      publisher: candidate.publisher,
      headline: candidate.headline,
      original_snippet: candidate.snippet,
      image_url: candidate.imageUrl,
      published_at: candidate.publishedAt ?? new Date().toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error(`[${sourceId}] insert failed for ${candidate.url}:`, insertError);
    stats.errors++;
    return;
  }

  stats.new++;

  // Summarize + tag (async — but we await here for simplicity; parallelize later)
  try {
    const gemini = await summarizeAndTag({
      headline: candidate.headline,
      body: candidate.body,
      publisher: candidate.publisher,
    });

    const summaryAt = new Date().toISOString();
    const summaryModel = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

    if (!gemini.is_football_news) {
      // Article isn't primarily about football — hide it from the feed. Stash the topic_category
      // in failure_reason so we can audit drift in the eval HTML without a schema migration.
      await supabase
        .from('articles')
        .update({
          summary: gemini.summary,
          summary_model: summaryModel,
          summary_at: summaryAt,
          status: 'hidden',
          failure_reason: `not_football:${gemini.topic_category}`,
        })
        .eq('id', inserted.id);
      stats.hidden++;
      return;
    }

    const entityIds = await resolveEntities(supabase, gemini.entities);

    // Update article + link entities in a logical transaction
    await supabase
      .from('articles')
      .update({
        summary: gemini.summary,
        summary_model: summaryModel,
        summary_at: summaryAt,
        status: 'summarized',
      })
      .eq('id', inserted.id);

    if (entityIds.length > 0) {
      await supabase.from('article_entities').insert(
        entityIds.map((entity_id) => ({
          article_id: inserted.id,
          entity_id,
        }))
      );
    }
  } catch (e: any) {
    console.error(`[${sourceId}] summarization failed for ${candidate.url}:`, e.message);
    await supabase
      .from('articles')
      .update({ status: 'failed', failure_reason: e.message?.slice(0, 500) })
      .eq('id', inserted.id);
    stats.errors++;
  }
}

async function ingestSource(source: RssSource): Promise<IngestStats> {
  const stats: IngestStats = { fetched: 0, new: 0, hidden: 0, errors: 0 };

  let feed;
  try {
    feed = await parser.parseURL(source.feedUrl);
  } catch (e: any) {
    console.error(`[${source.id}] feed fetch failed:`, e);
    // "Unable to parse XML." usually means the publisher served HTML (consent page,
    // geo-block, CAPTCHA) instead of XML. Fetch once more without rss-parser so the
    // log shows what actually came back — invaluable when this only repros in CI.
    if (typeof e?.message === 'string' && e.message.includes('parse XML')) {
      try {
        const res = await fetch(source.feedUrl, {
          headers: { 'User-Agent': 'Footshorts/1.0 (+https://footshorts.app)' },
        });
        const body = await res.text();
        console.error(
          `[${source.id}] diagnostic: HTTP ${res.status} ${res.headers.get('content-type') ?? '?'} | first 200 chars: ${body.slice(0, 200)}`
        );
      } catch (probeErr) {
        console.error(`[${source.id}] diagnostic probe also failed:`, probeErr);
      }
    }
    return stats;
  }

  stats.fetched = feed.items.length;

  for (const item of feed.items) {
    if (!item.link || !item.title) continue;
    await processCandidateArticle(
      source.id,
      {
        url: item.link,
        headline: item.title,
        publisher: source.publisher,
        body: item.content ?? item.contentSnippet ?? item.title,
        snippet: item.contentSnippet ?? item.content ?? null,
        imageUrl: extractImage(item),
        publishedAt: item.isoDate ?? item.pubDate ?? null,
      },
      stats
    );
  }

  return stats;
}

// Cap on article pages fetched per scrape source per run: each new article is
// an extra page request against the scraped site (unlike RSS, where the feed
// carries the content), so keep runs polite. The hourly cron drains any backlog.
const MAX_SCRAPED_ARTICLES_PER_RUN = 10;

async function ingestScrapeSource(source: ScrapeSource): Promise<IngestStats> {
  const stats: IngestStats = { fetched: 0, new: 0, hidden: 0, errors: 0 };

  let links;
  try {
    links = await listArticleLinks(source.listingUrl);
  } catch (e: any) {
    console.error(`[${source.id}] listing fetch failed:`, e.message ?? e);
    return stats;
  }

  stats.fetched = links.length;

  let fetched = 0;
  for (const link of links) {
    if (fetched >= MAX_SCRAPED_ARTICLES_PER_RUN) break;
    // Dedupe BEFORE fetching the article page — most listed links are old news
    // on any given run, and skipping known URLs keeps the request count at
    // "new articles only" instead of "everything listed, every hour".
    if (await isKnownUrl(hashUrl(link.url))) continue;

    let article;
    try {
      article = await fetchArticleBody(link.url);
      fetched++;
    } catch (e: any) {
      console.error(`[${source.id}] article fetch failed for ${link.url}:`, e.message ?? e);
      stats.errors++;
      continue;
    }

    await processCandidateArticle(
      source.id,
      {
        url: link.url,
        headline: article.title || link.headline,
        publisher: source.publisher,
        body: article.body,
        // Scraped pages have no syndication description; store nothing rather
        // than the full text (attribution policy: summarize only, link back).
        snippet: null,
        imageUrl: article.imageUrl,
        publishedAt: article.publishedAt,
      },
      stats
    );
  }

  return stats;
}

export function extractImage(item: Parser.Item & Record<string, any>): string | null {
  // 1. Enclosure (standard podcast-style tag, used by Sky Sports)
  if (item.enclosure?.url) return item.enclosure.url;

  // 2. media:content — may be an array (Guardian provides multiple sizes); pick the largest.
  const mc = item.mediaContent;
  if (Array.isArray(mc) && mc.length > 0) {
    const best = mc
      .map((m: any) => ({ url: m?.$?.url, width: parseInt(m?.$?.width ?? '0', 10) }))
      .filter((m) => m.url)
      .sort((a, b) => b.width - a.width)[0];
    if (best?.url) return best.url;
  } else if (mc?.$?.url) {
    return mc.$.url;
  }

  // 3. media:thumbnail (BBC). URLs follow pattern /ace/standard/240/... — upscale to /976/.
  const mt = item.mediaThumbnail;
  if (mt?.$?.url) {
    return String(mt.$.url).replace(/\/ace\/standard\/\d+\//, '/ace/standard/976/');
  }

  // 4. Fallback: first <img> in content HTML
  const html = item.content ?? '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

export async function runIngestion() {
  console.log(`[ingest] starting at ${new Date().toISOString()}`);
  const totals: IngestStats = { fetched: 0, new: 0, hidden: 0, errors: 0 };

  const addTotals = (id: string, stats: IngestStats) => {
    console.log(`[${id}] fetched=${stats.fetched} new=${stats.new} hidden=${stats.hidden} errors=${stats.errors}`);
    totals.fetched += stats.fetched;
    totals.new += stats.new;
    totals.hidden += stats.hidden;
    totals.errors += stats.errors;
  };

  for (const source of RSS_SOURCES) {
    addTotals(source.id, await ingestSource(source));
  }
  for (const source of SCRAPE_SOURCES) {
    addTotals(source.id, await ingestScrapeSource(source));
  }

  console.log(`[ingest] done: fetched=${totals.fetched} new=${totals.new} hidden=${totals.hidden} errors=${totals.errors}`);
  return totals;
}

// Entry point when run directly
if (require.main === module) {
  runIngestion()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('fatal:', e);
      process.exit(1);
    });
}
