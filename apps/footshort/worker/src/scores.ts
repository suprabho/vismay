/**
 * Refresh scores for fixtures that finished recently.
 *
 * Scope: only updates rows that already exist in the fixtures table — never inserts.
 * For each seeded competition we ask football-data.org for FINISHED matches in the
 * last 2 days, resolve each to a local fixture by (home_team_id, away_team_id, kickoff_at ±6h),
 * and write home_score / away_score / status='finished'.
 *
 * Run via: `npm run scores` (one-shot) or scheduled by .github/workflows/scores.yml (every 12h).
 */

import { createClient } from '@supabase/supabase-js';

const FD_BASE = 'https://api.football-data.org/v4';
const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// Same set seed.ts seeds. Free tier covers all of these.
const COMPETITION_CODES = [
  'PL', 'PD', 'BL1', 'SA', 'FL1', 'CL', 'EL',
  'WC', 'EC', 'DED', 'PPL', 'BSA', 'ELC',
];

// Window we ask FD about. Cron runs every 12h; 2 days catches anything we missed
// on the previous run (delayed kickoffs, late results, FD ingestion lag).
const LOOKBACK_DAYS = 2;

// ±6h around FD's utcDate is enough to absorb clock drift between FD and our
// stored kickoff_at without colliding with another fixture between the same teams.
const KICKOFF_WINDOW_MS = 6 * 60 * 60 * 1000;

// Free tier: 10 req/min. 6.5s between FD calls keeps us well clear.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { id: number };
  awayTeam: { id: number };
  score: {
    fullTime: { home: number | null; away: number | null };
  };
};

async function fdFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { 'X-Auth-Token': FD_TOKEN },
  });
  if (!res.ok) {
    throw new Error(`football-data ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function loadTeamMap(): Promise<Map<number, string>> {
  const { data, error } = await supabase
    .from('entities')
    .select('id, football_data_id')
    .eq('type', 'team')
    .not('football_data_id', 'is', null);
  if (error) throw error;
  const map = new Map<number, string>();
  for (const row of data ?? []) {
    map.set((row as any).football_data_id as number, (row as any).id as string);
  }
  return map;
}

async function findFixtureId(
  homeTeamId: string,
  awayTeamId: string,
  utcDate: string,
): Promise<string | null> {
  const t = new Date(utcDate).getTime();
  const lo = new Date(t - KICKOFF_WINDOW_MS).toISOString();
  const hi = new Date(t + KICKOFF_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from('fixtures')
    .select('id')
    .eq('home_team_id', homeTeamId)
    .eq('away_team_id', awayTeamId)
    .gte('kickoff_at', lo)
    .lte('kickoff_at', hi)
    .neq('status', 'finished');
  if (error) throw error;

  if (!data || data.length === 0) return null;
  if (data.length > 1) {
    console.warn(`  multiple fixtures matched home=${homeTeamId} away=${awayTeamId} near ${utcDate}; skipping`);
    return null;
  }
  return (data[0] as any).id as string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function refreshCompetition(code: string, teamMap: Map<number, string>) {
  const today = new Date();
  const dateFrom = ymd(new Date(today.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
  const dateTo = ymd(today);

  const data = await fdFetch<{ matches: FdMatch[] }>(
    `/competitions/${code}/matches?status=FINISHED&dateFrom=${dateFrom}&dateTo=${dateTo}`,
  );

  let updated = 0;
  let skipped = 0;
  for (const m of data.matches) {
    const home = teamMap.get(m.homeTeam.id);
    const away = teamMap.get(m.awayTeam.id);
    if (!home || !away) { skipped++; continue; }

    const homeScore = m.score.fullTime.home;
    const awayScore = m.score.fullTime.away;
    if (homeScore === null || awayScore === null) { skipped++; continue; }

    const fixtureId = await findFixtureId(home, away, m.utcDate);
    if (!fixtureId) { skipped++; continue; }

    const { error } = await supabase
      .from('fixtures')
      .update({
        status: 'finished',
        home_score: homeScore,
        away_score: awayScore,
      })
      .eq('id', fixtureId);
    if (error) {
      console.error(`  update ${fixtureId} failed: ${error.message}`);
      skipped++;
      continue;
    }
    updated++;
  }
  console.log(`[scores] ${code}: ${data.matches.length} finished, ${updated} updated, ${skipped} skipped`);
}

async function main() {
  if (!FD_TOKEN) throw new Error('FOOTBALL_DATA_TOKEN required');

  const teamMap = await loadTeamMap();
  console.log(`[scores] loaded ${teamMap.size} team mappings`);

  for (let i = 0; i < COMPETITION_CODES.length; i++) {
    if (i > 0) await sleep(6500);
    const code = COMPETITION_CODES[i]!;
    try {
      await refreshCompetition(code, teamMap);
    } catch (e) {
      console.error(`[scores] ${code} failed: ${(e as Error).message}`);
    }
  }

  console.log('[scores] done.');
}

main().catch((e) => {
  console.error('[scores] fatal:', e);
  process.exit(1);
});
