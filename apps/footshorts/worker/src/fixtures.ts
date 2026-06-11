/**
 * Sync fixtures + standings from football-data.org into Supabase.
 *
 * Runs per-competition: pulls all matches of the current season + every TOTAL
 * standings table (one per group for group-stage cups). Idempotent — upserts on
 * football_data_id for fixtures and on
 * (competition_slug, season, group_label, team_id) for standings.
 *
 * Free tier caveats:
 *   - 10 req/min → 6.5s sleep between calls.
 *   - Per-match stats (shots, possession, cards) are paid-tier only, so
 *     fixture_stats is not populated here.
 *   - Cups often have no TOTAL standings table — we skip them gracefully.
 *
 * Usage: npm run fixtures
 */

import { createClient } from '@supabase/supabase-js';

const FD_BASE = 'https://api.football-data.org/v4';
const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fdFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { 'X-Auth-Token': FD_TOKEN },
  });
  if (!res.ok) {
    // Surface football-data's response body — a bare status is useless to debug
    // (a 400 with "Your API token is invalid." looks identical to any other 400
    // until you read the message).
    const body = await res.text().catch(() => '');
    const detail = body.replace(/\s+/g, ' ').trim().slice(0, 300);
    throw new Error(
      `football-data ${path} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`,
    );
  }
  return res.json() as Promise<T>;
}

type FdSeason = { startDate: string; endDate: string };

/**
 * Normalize football-data's season object to our convention:
 *   multi-year league (Aug 2025 → May 2026) → "25-26"
 *   single-year cup   (Jun 2025 → Jul 2025) → "2025"
 */
function normalizeSeason(s: FdSeason): string {
  const start = new Date(s.startDate).getUTCFullYear();
  const end = new Date(s.endDate).getUTCFullYear();
  if (start === end) return String(start);
  return `${String(start).slice(-2)}-${String(end).slice(-2)}`;
}

// football-data.org tags group-stage standings tables with a `group` like
// "GROUP_A". Normalise to the "Group A" display label the standings UI buckets
// on; non-group (league) tables carry `group: null` → '' (the column default).
function formatGroupLabel(group: string | null | undefined): string {
  if (!group) return '';
  return group
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

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

async function loadCompetitions() {
  const { data, error } = await supabase
    .from('entities')
    .select('id, slug, name, football_data_id')
    .eq('type', 'league')
    .not('football_data_id', 'is', null);
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    football_data_id: number;
  }>;
}

async function loadTeamIndex(): Promise<Map<number, string>> {
  const { data, error } = await supabase
    .from('entities')
    .select('id, football_data_id')
    .eq('type', 'team')
    .not('football_data_id', 'is', null);
  if (error) throw error;
  const map = new Map<number, string>();
  for (const t of data ?? []) map.set(t.football_data_id as number, t.id as string);
  return map;
}

async function syncFixtures(
  comp: { slug: string; football_data_id: number },
  teamIndex: Map<number, string>,
) {
  const data = await fdFetch<{ matches: any[] }>(
    `/competitions/${comp.football_data_id}/matches`,
  );

  const rows = data.matches.map((m) => {
    const homeFdId = m.homeTeam?.id as number | null;
    const awayFdId = m.awayTeam?.id as number | null;
    const homeId = homeFdId ? teamIndex.get(homeFdId) ?? null : null;
    const awayId = awayFdId ? teamIndex.get(awayFdId) ?? null : null;
    return {
      football_data_id: m.id,
      competition_slug: comp.slug,
      season: normalizeSeason(m.season),
      matchday: m.matchday ?? null,
      stage: m.stage ?? null,
      home_team_id: homeId,
      away_team_id: awayId,
      home_team_name: homeId ? null : m.homeTeam?.name ?? 'TBD',
      away_team_name: awayId ? null : m.awayTeam?.name ?? 'TBD',
      kickoff_at: m.utcDate,
      status: normalizeStatus(m.status),
      home_score: m.score?.fullTime?.home ?? null,
      away_score: m.score?.fullTime?.away ?? null,
      home_ht_score: m.score?.halfTime?.home ?? null,
      away_ht_score: m.score?.halfTime?.away ?? null,
      venue: m.venue ?? null,
      updated_at: new Date().toISOString(),
    };
  });

  if (rows.length === 0) {
    console.log(`  [${comp.slug}] fixtures: 0`);
    return;
  }

  const { error } = await supabase
    .from('fixtures')
    .upsert(rows, { onConflict: 'football_data_id' });
  if (error) throw error;
  console.log(`  [${comp.slug}] fixtures: +${rows.length}`);
}

async function syncStandings(
  comp: { slug: string; football_data_id: number },
  teamIndex: Map<number, string>,
) {
  let data: { standings: any[]; season: FdSeason };
  try {
    data = await fdFetch(`/competitions/${comp.football_data_id}/standings`);
  } catch (e) {
    console.log(`  [${comp.slug}] standings: unavailable (${(e as Error).message})`);
    return;
  }

  // Group-stage competitions (World Cup, Euros) return one TOTAL table per
  // group — each carrying a `group` like "GROUP_A". Domestic leagues return a
  // single TOTAL with `group: null`. Ingest every TOTAL table so all groups
  // land, not just the first one `.find` would have returned.
  const totals = data.standings.filter((s: any) => s.type === 'TOTAL');
  if (totals.length === 0) {
    console.log(`  [${comp.slug}] standings: no TOTAL table`);
    return;
  }

  const season = normalizeSeason(data.season);
  const rows = totals.flatMap((table: any) => {
    const groupLabel = formatGroupLabel(table.group);
    const phase = table.group ? 'group' : 'league';
    return (table.table ?? [])
      .map((r: any) => {
        const teamId = teamIndex.get(r.team?.id);
        if (!teamId) return null;
        return {
          competition_slug: comp.slug,
          season,
          team_id: teamId,
          group_label: groupLabel,
          phase,
          position: r.position,
          played: r.playedGames,
          won: r.won,
          draw: r.draw,
          lost: r.lost,
          goals_for: r.goalsFor,
          goals_against: r.goalsAgainst,
          goal_difference: r.goalDifference,
          points: r.points,
          form: r.form ?? null,
          updated_at: new Date().toISOString(),
        };
      })
      .filter((r: any): r is NonNullable<typeof r> => r !== null);
  });

  if (rows.length === 0) {
    console.log(`  [${comp.slug}] standings: 0 (no mapped teams)`);
    return;
  }

  // Clear this competition+season's standings before re-inserting. Group-stage
  // tables were previously written with group_label='' (only the first group
  // survived `.find`); without this delete those stale rows would linger under
  // a phantom "overall" group alongside the new per-group rows. Scoped to the
  // season we're about to write, and only once we have fresh rows in hand, so a
  // failed fetch never wipes good data.
  const { error: delError } = await supabase
    .from('standings')
    .delete()
    .eq('competition_slug', comp.slug)
    .eq('season', season);
  if (delError) throw delError;

  // Conflict target matches the post-20260521 PK (group_label included) so the
  // same team can hold a row in different groups.
  const { error } = await supabase
    .from('standings')
    .upsert(rows, { onConflict: 'competition_slug,season,group_label,team_id' });
  if (error) throw error;
  const groupCount = new Set(rows.map((r: any) => r.group_label)).size;
  console.log(
    `  [${comp.slug}] standings: +${rows.length}` +
      (groupCount > 1 ? ` (${groupCount} groups)` : ''),
  );
}

async function main() {
  if (!FD_TOKEN) throw new Error('FOOTBALL_DATA_TOKEN required');

  const comps = await loadCompetitions();
  const teamIndex = await loadTeamIndex();
  console.log(
    `[fixtures] ${comps.length} competitions, ${teamIndex.size} teams indexed`,
  );

  for (const comp of comps) {
    try {
      await syncFixtures(comp, teamIndex);
    } catch (e) {
      console.error(`  [${comp.slug}] fixtures failed:`, (e as Error).message);
    }
    await sleep(6500);

    try {
      await syncStandings(comp, teamIndex);
    } catch (e) {
      console.error(`  [${comp.slug}] standings failed:`, (e as Error).message);
    }
    await sleep(6500);
  }

  console.log('[fixtures] done.');
}

main().catch((e) => {
  console.error('[fixtures] fatal:', e);
  process.exit(1);
});
