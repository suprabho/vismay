/**
 * Backfill article_entities tags for teams whose slug was renamed after
 * articles had already been ingested. Tagging happens only at ingest and
 * ingest dedupes by url_hash, so a resolver miss is never retried — articles
 * published while a team's slug was wrong stay untagged forever (no chip, and
 * the FeedCard image placeholder falls back to bare "No image").
 *
 * For each target slug we word-boundary-match the team's common name (the
 * slug, de-hyphenated) against headlines and summaries, then insert the
 * missing (article_id, entity_id) rows. ignoreDuplicates on the composite PK
 * makes repeat runs cheap and leaves Gemini-tagged articles untouched;
 * confidence keeps its 1.0 default, same as an exact resolver hit.
 *
 * Run via: npm run backfill:entity-tags [-- slug ...]
 *   (defaults to the teams renamed by the 20260705 + 20260709 slug-fix migrations)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// Teams renamed by 20260705000000_fix_glued_acronym_team_slugs.sql and
// 20260709000000_fix_glued_word_team_slugs.sql.
const DEFAULT_SLUGS = ['fiorentina', 'atalanta', 'genoa', 'cagliari', 'parma', 'udinese', 'sassuolo'];

const PAGE = 1000;
const UPSERT_CHUNK = 500;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchMatchingArticles(term: string): Promise<{ id: string }[]> {
  // ilike casts a wide net server-side; the word-boundary regex below trims
  // substring hits ("Parmar", "Genoan") that ilike can't exclude.
  const wordRe = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
  const matches: { id: string }[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('articles')
      .select('id, headline, summary')
      .or(`headline.ilike.%${term}%,summary.ilike.%${term}%`)
      .order('published_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;

    for (const a of data ?? []) {
      if (wordRe.test(a.headline ?? '') || wordRe.test(a.summary ?? '')) {
        matches.push({ id: a.id });
      }
    }
    if (!data || data.length < PAGE) break;
  }

  return matches;
}

async function run() {
  const slugs = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const targets = slugs.length > 0 ? slugs : DEFAULT_SLUGS;

  let totalInserted = 0;

  for (const slug of targets) {
    const { data: entity, error: eErr } = await supabase
      .from('entities')
      .select('id, slug, name')
      .eq('type', 'team')
      .eq('slug', slug)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!entity) {
      console.error(`[entity-tags] ${slug}: no team entity with this slug — skipping (is the slug migration applied?)`);
      continue;
    }

    const term = slug.replace(/-/g, ' ');
    const articles = await fetchMatchingArticles(term);
    if (articles.length === 0) {
      console.log(`[entity-tags] ${slug}: no matching articles`);
      continue;
    }

    let inserted = 0;
    for (let i = 0; i < articles.length; i += UPSERT_CHUNK) {
      const rows = articles.slice(i, i + UPSERT_CHUNK).map((a) => ({
        article_id: a.id,
        entity_id: entity.id,
      }));
      const { data, error } = await supabase
        .from('article_entities')
        .upsert(rows, { onConflict: 'article_id,entity_id', ignoreDuplicates: true })
        .select('article_id');
      if (error) throw error;
      inserted += data?.length ?? 0;
    }

    totalInserted += inserted;
    console.log(
      `[entity-tags] ${slug}: matched=${articles.length} newly-tagged=${inserted} already-tagged=${articles.length - inserted}`
    );
  }

  console.log(`[entity-tags] done: inserted=${totalInserted}`);
}

run().catch((e) => {
  console.error('[entity-tags] fatal:', e);
  process.exit(1);
});
