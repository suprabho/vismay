/**
 * Audit what seasons the `fixtures` table holds, per competition.
 *
 * The sync upserts on football_data_id and never deletes, so `fixtures` is an
 * archive: one row-set per season, several seasons deep for the competitions
 * we've tracked longest. That's deliberate (recaps, fixture_events and
 * opta_match_facts all hang off historical rows) — but it means the apps have
 * to pin a season when they read, and this script shows what they'd pin to.
 *
 * `current` is resolved the same way the apps resolve it: the season of the
 * competition's furthest-out fixture. A competition whose current season looks
 * finished (its last kickoff is in the past) is flagged — that's the shape of
 * "the new season hasn't landed", i.e. a sync that isn't reaching it.
 *
 * Read-only. Usage:
 *   npm run fixtures:seasons
 *   npm run fixtures:seasons -- champions-league
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Row = { competition_slug: string; season: string; kickoff_at: string; status: string };

type SeasonStat = {
  season: string;
  fixtures: number;
  finished: number;
  first: string;
  last: string;
};

// Season labels don't sort as strings ("2026" lands before "25-26"), so order
// on the start year. Mirrors compareSeasons in @vismay/footshorts-viz.
function seasonStartYear(season: string): number {
  const two = /^(\d{2})-(\d{2})$/.exec(season);
  if (two) return 2000 + Number(two[1]);
  const one = /^(\d{4})$/.exec(season);
  return one ? Number(one[1]) : 0;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const only = process.argv.slice(2).find((a) => !a.startsWith('--'));

  // Paged so the audit doesn't silently stop at PostgREST's default row cap.
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('fixtures')
      .select('competition_slug, season, kickoff_at, status')
      .order('kickoff_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (only) q = q.eq('competition_slug', only);
    const { data, error } = await q;
    if (error) throw error;
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  if (rows.length === 0) {
    console.log(only ? `[${only}] no fixtures.` : 'No fixtures.');
    return;
  }

  const byComp = new Map<string, Map<string, SeasonStat>>();
  for (const r of rows) {
    const seasons = byComp.get(r.competition_slug) ?? new Map<string, SeasonStat>();
    const stat = seasons.get(r.season) ?? {
      season: r.season,
      fixtures: 0,
      finished: 0,
      first: r.kickoff_at,
      last: r.kickoff_at,
    };
    stat.fixtures += 1;
    if (r.status === 'finished') stat.finished += 1;
    if (r.kickoff_at < stat.first) stat.first = r.kickoff_at;
    if (r.kickoff_at > stat.last) stat.last = r.kickoff_at;
    seasons.set(r.season, stat);
    byComp.set(r.competition_slug, seasons);
  }

  const now = new Date().toISOString();
  const stale: string[] = [];

  for (const slug of Array.from(byComp.keys()).sort()) {
    const seasons = Array.from(byComp.get(slug)!.values()).sort(
      (a, b) => seasonStartYear(b.season) - seasonStartYear(a.season) || b.season.localeCompare(a.season),
    );
    // The apps read the season of the furthest-out fixture as "current".
    const current = seasons.reduce((best, s) => (s.last > best.last ? s : best), seasons[0]!);
    console.log(`\n${slug}  (${seasons.length} season${seasons.length === 1 ? '' : 's'} held)`);
    for (const s of seasons) {
      const marker = s === current ? '→' : ' ';
      console.log(
        `  ${marker} ${s.season.padEnd(7)} ${String(s.fixtures).padStart(4)} fixtures` +
          ` (${String(s.finished).padStart(4)} finished)  ${s.first.slice(0, 10)} → ${s.last.slice(0, 10)}`,
      );
    }
    if (current.last < now) {
      stale.push(slug);
      console.log(
        `    ⚠ current season ended ${current.last.slice(0, 10)} — no newer season has been synced.`,
      );
    }
  }

  console.log(
    `\n${rows.length} fixtures across ${byComp.size} competitions.` +
      ' → marks the season the apps treat as current.',
  );
  if (stale.length > 0) {
    console.log(
      `\nNothing upcoming for: ${stale.join(', ')}.` +
        `\nRe-sync with: npm run fixtures -- --competitions=${stale.join(',')}`,
    );
  }
}

main().catch((e) => {
  console.error('[fixtures:seasons] fatal:', (e as Error).message);
  process.exit(1);
});
