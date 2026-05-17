/**
 * Backfill image_url on existing articles by re-parsing the same RSS feeds.
 * Cheap: no Gemini calls, just RSS + one UPDATE per matched item.
 *
 * Run via: npm run backfill:images
 */

import Parser from 'rss-parser';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { RSS_SOURCES } from './sources';
import { extractImage } from './ingest';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

const parser = new Parser({
  headers: { 'User-Agent': 'ShortFoot/1.0 (+https://shortfoot.app)' },
  timeout: 10000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
    ],
  },
});

const hashUrl = (u: string) => crypto.createHash('sha256').update(u).digest('hex');

async function backfill() {
  let totalChecked = 0;
  let totalUpdated = 0;

  for (const source of RSS_SOURCES) {
    let feed;
    try {
      feed = await parser.parseURL(source.feedUrl);
    } catch (e) {
      console.error(`[${source.id}] feed failed:`, (e as Error).message);
      continue;
    }

    let updated = 0;
    for (const item of feed.items) {
      if (!item.link) continue;
      const image = extractImage(item);
      if (!image) continue;

      const { data, error } = await supabase
        .from('articles')
        .update({ image_url: image })
        .eq('url_hash', hashUrl(item.link))
        .is('image_url', null) // only fill gaps — don't overwrite working URLs
        .select('id');

      if (error) {
        console.error(`[${source.id}] update failed for ${item.link}:`, error.message);
        continue;
      }
      if (data && data.length > 0) updated++;
      totalChecked++;
    }
    console.log(`[${source.id}] checked=${feed.items.length} updated=${updated}`);
    totalUpdated += updated;
  }

  console.log(`[backfill] done: checked=${totalChecked} updated=${totalUpdated}`);
}

backfill().catch((e) => {
  console.error('[backfill] fatal:', e);
  process.exit(1);
});
