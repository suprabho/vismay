/**
 * Ingestion pipeline.
 *
 * Flow:
 *   1. For each RSS source, fetch + parse
 *   2. For each item, compute url_hash; skip if already in DB
 *   3. Insert row with status='pending'
 *   4. Call Gemini for summary + entities
 *   5. Map Gemini's free-text entity names to canonical entity IDs
 *   6. Update row with summary + link article_entities
 *
 * Run via: `npm run ingest` (one-shot) or schedule via cron
 */

import Parser from 'rss-parser';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { RSS_SOURCES, RssSource } from './sources';
import { summarizeAndTag } from './gemini';
import { resolveEntities } from './entityResolver';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const parser = new Parser({
  headers: {
    'User-Agent': 'ShortFoot/1.0 (+https://shortfoot.app)',
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

async function ingestSource(source: RssSource): Promise<{ fetched: number; new: number; hidden: number; errors: number }> {
  const stats = { fetched: 0, new: 0, hidden: 0, errors: 0 };
  
  let feed;
  try {
    feed = await parser.parseURL(source.feedUrl);
  } catch (e) {
    console.error(`[${source.id}] feed fetch failed:`, e);
    return stats;
  }

  stats.fetched = feed.items.length;

  for (const item of feed.items) {
    if (!item.link || !item.title) continue;

    const urlHash = hashUrl(item.link);

    // Check for dupe
    const { data: existing } = await supabase
      .from('articles')
      .select('id')
      .eq('url_hash', urlHash)
      .maybeSingle();

    if (existing) continue;

    const imageUrl = extractImage(item);

    // Insert pending row
    const { data: inserted, error: insertError } = await supabase
      .from('articles')
      .insert({
        url: item.link,
        url_hash: urlHash,
        publisher: source.publisher,
        headline: item.title,
        original_snippet: item.contentSnippet ?? item.content ?? null,
        image_url: imageUrl,
        published_at: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      console.error(`[${source.id}] insert failed for ${item.link}:`, insertError);
      stats.errors++;
      continue;
    }

    stats.new++;

    // Summarize + tag (async — but we await here for simplicity; parallelize later)
    try {
      const body = item.content ?? item.contentSnippet ?? item.title;
      const gemini = await summarizeAndTag({
        headline: item.title,
        body,
        publisher: source.publisher,
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
        continue;
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
      console.error(`[${source.id}] summarization failed for ${item.link}:`, e.message);
      await supabase
        .from('articles')
        .update({ status: 'failed', failure_reason: e.message?.slice(0, 500) })
        .eq('id', inserted.id);
      stats.errors++;
    }
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
  const totals = { fetched: 0, new: 0, hidden: 0, errors: 0 };

  for (const source of RSS_SOURCES) {
    const stats = await ingestSource(source);
    console.log(`[${source.id}] fetched=${stats.fetched} new=${stats.new} hidden=${stats.hidden} errors=${stats.errors}`);
    totals.fetched += stats.fetched;
    totals.new += stats.new;
    totals.hidden += stats.hidden;
    totals.errors += stats.errors;
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
