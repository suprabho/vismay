/**
 * Force a score refresh for a single fixture by football-data.org match id.
 *
 * Unlike the scheduled `scores.ts` (which scans a 2-day window, only touches
 * matches FD reports as FINISHED, and skips fixtures already marked finished),
 * this targets ONE match and updates it regardless of current local status —
 * handy for correcting a stale/wrong score or pulling a result the cron missed.
 *
 * Resolution mirrors scores.ts: map FD team ids → local entity ids, then find the
 * fixture by (home_team_id, away_team_id, kickoff_at ±6h).
 *
 * Usage:
 *   npm run match:refresh -- 419291            # dry run: print what would change
 *   npm run match:refresh -- 419291 --write    # actually write to the fixtures table
 *
 * Find ids with: npm run match:list -- <COMP>
 */

import { createClient } from '@supabase/supabase-js';
import { fdFetch, FD_TOKEN } from './footballData';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// Same ±6h tolerance scores.ts uses to absorb clock drift between FD and us.
const KICKOFF_WINDOW_MS = 6 * 60 * 60 * 1000;

type Side = { home: number | null; away: number | null };

type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { id: number; name?: string };
  awayTeam: { id: number; name?: string };
  score: { fullTime: Side };
};

// FD status → footshorts status (subset of fixtures.ts normalizeStatus).
function normalizeStatus(s: string): string {
  switch (s) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'scheduled';
    case 'IN_PLAY':
    case 'PAUSED':
      return 'live';
    case 'FINISHED':
      return 'finished';
    case 'POSTPONED':
      return 'postponed';
    case 'SUSPENDED':
    case 'CANCELLED':
      return 'cancelled';
    default:
      return s.toLowerCase();
  }
}

async function localTeamId(fdTeamId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('entities')
    .select('id')
    .eq('type', 'team')
    .eq('football_data_id', fdTeamId)
    .maybeSingle();
  if (error) throw error;
  return data ? ((data as any).id as string) : null;
}

async function findFixtureId(
  homeTeamId: string,
  awayTeamId: string,
  utcDate: string,
): Promise<string | null> {
  const t = new Date(utcDate).getTime();
  const lo = new Date(t - KICKOFF_WINDOW_MS).toISOString();
  const hi = new Date(t + KICKOFF_WINDOW_MS).toISOString();

  // Note: unlike scores.ts we do NOT exclude status='finished' — a force refresh
  // is meant to overwrite an already-finished fixture if needed.
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, status, home_score, away_score')
    .eq('home_team_id', homeTeamId)
    .eq('away_team_id', awayTeamId)
    .gte('kickoff_at', lo)
    .lte('kickoff_at', hi);
  if (error) throw error;

  if (!data || data.length === 0) return null;
  if (data.length > 1) {
    console.warn(`  multiple fixtures matched; ids: ${data.map((d: any) => d.id).join(', ')} — refusing to guess`);
    return null;
  }
  const row = data[0] as any;
  console.log(`  current fixture: id=${row.id} status=${row.status} score=${row.home_score}-${row.away_score}`);
  return row.id as string;
}

async function main() {
  if (!FD_TOKEN) throw new Error('FOOTBALL_DATA_TOKEN required');

  const id = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  if (!id) {
    throw new Error('usage: npm run match:refresh -- <matchId> [--write]');
  }
  const write = process.argv.slice(2).includes('--write');

  const m = await fdFetch<FdMatch>(`/matches/${id}`);
  console.log(
    `FD match ${m.id}: ${m.homeTeam?.name ?? '?'} ${m.score.fullTime.home ?? '-'}-` +
      `${m.score.fullTime.away ?? '-'} ${m.awayTeam?.name ?? '?'}  (${m.status})`,
  );

  const home = await localTeamId(m.homeTeam.id);
  const away = await localTeamId(m.awayTeam.id);
  if (!home || !away) {
    throw new Error(`no local entity for ${!home ? 'home' : 'away'} team (FD ids ${m.homeTeam.id}/${m.awayTeam.id}) — is it seeded?`);
  }

  const fixtureId = await findFixtureId(home, away, m.utcDate);
  if (!fixtureId) {
    throw new Error(`no local fixture found near ${m.utcDate} for these teams`);
  }

  const next = {
    status: normalizeStatus(m.status),
    home_score: m.score.fullTime.home,
    away_score: m.score.fullTime.away,
  };

  if (!write) {
    console.log(`  [dry run] would set ${JSON.stringify(next)} — pass --write to apply`);
    return;
  }

  const { error } = await supabase.from('fixtures').update(next).eq('id', fixtureId);
  if (error) throw error;
  console.log(`  updated fixture ${fixtureId}: ${JSON.stringify(next)}`);
}

main().catch((e) => {
  console.error('[match:refresh] fatal:', (e as Error).message);
  process.exit(1);
});
