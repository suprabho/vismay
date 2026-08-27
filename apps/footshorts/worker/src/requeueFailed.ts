/**
 * Re-run summarization for articles that landed as status='failed'.
 *
 * Ingest dedupes on url_hash and never retries a failed row, so an outage in
 * the summarize → entity-link → update path (e.g. 2026-08-24: the
 * entity_aliases migration was merged but not `db push`ed, so entityResolver
 * threw on every article for ~3 days) leaves the feed empty even after the
 * cause is fixed — the rows exist, they just never reach status='summarized'.
 *
 * This script selects failed rows (optionally filtered by failure_reason
 * substring), resets them to 'pending', and re-runs the same
 * summarizeStoredArticle() step ingest uses. Gemini input is what we still
 * have: original_snippet (the RSS description) for feed sources, or a fresh
 * fetch of the page for theanalyst scrape sources (which store no snippet).
 *
 * Run via: pnpm requeue:failed [-- --reason=entity_aliases] [--since=2026-08-24] [--limit=50] [--dry-run]
 *   Defaults: --reason=entity_aliases, --since=3 days ago, --limit=400.
 * Sequential, one article at a time (shared Supabase instance — no write bursts).
 */

import { createClient } from '@supabase/supabase-js';
import { summarizeStoredArticle, emptyStats } from './ingest';
import { fetchArticleBody } from './theanalyst/news';
import { SCRAPE_SOURCES } from './sources';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const REASON = arg('reason') ?? 'entity_aliases';
const SINCE = arg('since') ?? new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
const LIMIT = Number(arg('limit') ?? 400);
const DRY_RUN = process.argv.includes('--dry-run');

const SCRAPE_PUBLISHERS = new Set(SCRAPE_SOURCES.map((s) => s.publisher));

type FailedRow = {
  id: string;
  url: string;
  headline: string;
  publisher: string;
  original_snippet: string | null;
  failure_reason: string | null;
};

async function main() {
  const { data, error } = await supabase
    .from('articles')
    .select('id, url, headline, publisher, original_snippet, failure_reason')
    .eq('status', 'failed')
    .ilike('failure_reason', `%${REASON}%`)
    .gte('published_at', SINCE)
    .order('published_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw error;

  const rows = (data ?? []) as FailedRow[];
  console.log(`[requeue] ${rows.length} failed articles matching "${REASON}" since ${SINCE}${DRY_RUN ? ' (dry run)' : ''}`);
  if (DRY_RUN || rows.length === 0) return;

  const stats = emptyStats();
  let skipped = 0;

  for (const row of rows) {
    let body: string | null = null;
    if (SCRAPE_PUBLISHERS.has(row.publisher)) {
      try {
        body = (await fetchArticleBody(row.url)).body;
      } catch (e: any) {
        console.warn(`[requeue] body fetch failed for ${row.url}: ${e.message}`);
      }
    } else {
      body = row.original_snippet;
    }
    if (!body || body.trim().length === 0) {
      console.warn(`[requeue] no body available for ${row.url}, leaving as failed`);
      skipped++;
      continue;
    }

    const { error: resetError } = await supabase
      .from('articles')
      .update({ status: 'pending', failure_reason: null })
      .eq('id', row.id);
    if (resetError) {
      console.error(`[requeue] reset failed for ${row.url}:`, resetError);
      stats.errors++;
      continue;
    }

    await summarizeStoredArticle(
      'requeue',
      row.id,
      { url: row.url, headline: row.headline, publisher: row.publisher, body },
      stats
    );
  }

  console.log(
    `[requeue] done: summarized=${stats.summarized} hidden=${stats.hidden} errors=${stats.errors} skipped=${skipped}`
  );
  if (stats.summarized === 0 && stats.errors > 0) {
    throw new Error('requeue: every article failed again — is the underlying cause fixed?');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('fatal:', e);
    process.exit(1);
  });
