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
 * makes repeat runs cheap and leaves ingest-tagged articles untouched;
 * confidence keeps its 1.0 default, same as an exact resolver hit.
 *
 * Run via: npm run backfill:entity-tags [-- slug ...]
 *   (defaults to the teams renamed by the 20260705 + 20260709 slug-fix migrations)
 *
 * National-team mode, for articles ingested before the 211 national teams
 * existed as entities (20261001000000_national_team_entities.sql):
 *   npm run backfill:entity-tags -- --national-teams [--days=30]
 * Scans headlines of summarized articles from the last N days (default 30)
 * with findNationalTeams (nationalTeamMatch.ts) — headlines only, since
 * summaries are full of passing "England midfielder …" mentions.
 */

import { createClient } from '@supabase/supabase-js';
import { findNationalTeams } from './nationalTeamMatch';

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

async function insertTags(rows: { article_id: string; entity_id: string }[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { data, error } = await supabase
      .from('article_entities')
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: 'article_id,entity_id', ignoreDuplicates: true })
      .select('article_id');
    if (error) throw error;
    inserted += data?.length ?? 0;
  }
  return inserted;
}

async function runNationalTeams(days: number) {
  const { data: teams, error: tErr } = await supabase
    .from('entities')
    .select('id, slug')
    .eq('type', 'team')
    .not('fifa_code', 'is', null);
  if (tErr) throw tErr;
  if (!teams || teams.length === 0) {
    console.error('[entity-tags] no national-team entities — apply 20261001000000_national_team_entities.sql first');
    process.exit(1);
  }
  const idBySlug = new Map(teams.map((t) => [t.slug, t.id]));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows: { article_id: string; entity_id: string }[] = [];
  const perTeam = new Map<string, number>();
  let scanned = 0;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('articles')
      .select('id, headline')
      .eq('status', 'summarized')
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;

    for (const a of data ?? []) {
      scanned++;
      for (const slug of findNationalTeams(a.headline ?? '')) {
        const entityId = idBySlug.get(slug);
        if (!entityId) continue;
        rows.push({ article_id: a.id, entity_id: entityId });
        perTeam.set(slug, (perTeam.get(slug) ?? 0) + 1);
      }
    }
    if (!data || data.length < PAGE) break;
  }

  const inserted = await insertTags(rows);
  const top = [...perTeam.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`[entity-tags] national teams, last ${days}d: scanned=${scanned} matched=${rows.length} newly-tagged=${inserted}`);
  console.log(`[entity-tags]   ${top.map(([slug, n]) => `${slug}=${n}`).join(' ') || '(no matches)'}`);
}

async function run() {
  const args = process.argv.slice(2);
  if (args.includes('--national-teams')) {
    const daysArg = args.find((a) => a.startsWith('--days='));
    const days = daysArg ? Number(daysArg.slice('--days='.length)) : 30;
    if (!Number.isFinite(days) || days <= 0) throw new Error(`--days wants a positive number, got ${daysArg}`);
    return runNationalTeams(days);
  }

  const slugs = args.filter((a) => !a.startsWith('-'));
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

    const inserted = await insertTags(articles.map((a) => ({ article_id: a.id, entity_id: entity.id })));

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
