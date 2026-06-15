/**
 * Sync per-match events (goals, cards, subs) from API-Football into fixture_events.
 *
 * football-data.org gives us scores but no event detail, so this worker fills in
 * who scored and when from API-Football's free tier. It runs after scores.ts:
 *
 *   1. Find finished fixtures from the last LOOKBACK_DAYS that have no events yet.
 *   2. Resolve each fixture's api_football_id (cached on the row once found): for
 *      every distinct kickoff day, pull `/fixtures?date=YYYY-MM-DD` and match AF
 *      fixtures to ours by the api_football_id team bridge + kickoff window.
 *   3. For each resolved fixture, pull `/fixtures/events?fixture={afId}` and upsert.
 *
 * Free tier = 100 req/day. Cost ≈ (distinct days) + (fixtures needing events), so
 * it scales with matches/day, not leagues. Anything skipped for lack of an AF id
 * or budget is logged, never silently dropped.
 *
 * Prereq: run seed-af-ids.ts once so entities.api_football_id is populated.
 *
 * Usage: npm run events        (one-shot)
 */

import { createClient } from '@supabase/supabase-js';

const AF_BASE = 'https://v3.football.api-sports.io';
const AF_TOKEN = process.env.API_FOOTBALL_TOKEN!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// How far back to look for finished-but-eventless fixtures. Matches scores.ts's
// window so the two stay in lockstep when run together.
const LOOKBACK_DAYS = 3;

// Same ±6h kickoff tolerance scores.ts uses to absorb clock drift between
// providers without colliding with another fixture between the same teams.
const KICKOFF_WINDOW_MS = 6 * 60 * 60 * 1000;

// Soft ceiling so one bad day can't blow the 100/day free-tier quota. Counts AF
// calls (day listings + per-fixture events). Anything beyond is logged + deferred.
const MAX_AF_CALLS = 90;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type AfResponse<T> = { response: T[]; errors?: unknown };

let afCalls = 0;

async function afFetch<T>(path: string): Promise<T[]> {
  afCalls++;
  const res = await fetch(`${AF_BASE}${path}`, { headers: { 'x-apisports-key': AF_TOKEN } });
  if (!res.ok) throw new Error(`api-football ${path} failed: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as AfResponse<T>;
  if (body.errors && !Array.isArray(body.errors) && Object.keys(body.errors).length > 0) {
    throw new Error(`api-football ${path} errors: ${JSON.stringify(body.errors)}`);
  }
  return body.response ?? [];
}

type FixtureRow = {
  id: string;
  api_football_id: number | null;
  kickoff_at: string;
  home_team_id: string | null;
  away_team_id: string | null;
};

/** entity id -> api_football_id, for the teams that play the candidate fixtures. */
async function loadTeamAfIds(teamIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (teamIds.length === 0) return map;
  const { data, error } = await supabase
    .from('entities')
    .select('id, api_football_id')
    .in('id', teamIds)
    .not('api_football_id', 'is', null);
  if (error) throw error;
  for (const e of data ?? []) map.set((e as any).id as string, (e as any).api_football_id as number);
  return map;
}

/**
 * Finished fixtures in the lookback window that don't have any events yet.
 * "No events yet" is the gate that makes this idempotent — once a match is
 * hydrated we never re-spend quota on it.
 */
async function loadCandidates(): Promise<FixtureRow[]> {
  const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: withEvents, error: weErr } = await supabase
    .from('fixture_events')
    .select('fixture_id');
  if (weErr) throw weErr;
  const hydrated = new Set((withEvents ?? []).map((r) => (r as any).fixture_id as string));

  const { data, error } = await supabase
    .from('fixtures')
    .select('id, api_football_id, kickoff_at, home_team_id, away_team_id')
    .eq('status', 'finished')
    .gte('kickoff_at', from)
    .order('kickoff_at', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as FixtureRow[]).filter((f) => !hydrated.has(f.id));
}

function ymd(iso: string): string {
  return iso.slice(0, 10);
}

type AfFixture = {
  fixture: { id: number; date: string };
  teams: { home: { id: number }; away: { id: number } };
};

/**
 * Resolve api_football_id for any candidate that doesn't already have one, by
 * listing AF fixtures per distinct kickoff day and matching on the team bridge +
 * kickoff window. Persists the id on the fixtures row so we only pay this once.
 */
async function resolveAfIds(
  candidates: FixtureRow[],
  teamAf: Map<string, number>,
): Promise<void> {
  const needing = candidates.filter((c) => c.api_football_id == null);
  if (needing.length === 0) return;

  const days = Array.from(new Set(needing.map((c) => ymd(c.kickoff_at))));
  for (const day of days) {
    if (afCalls >= MAX_AF_CALLS) {
      console.log(`[events] budget reached during id resolution — ${days.length} day(s) pending; resumes next run.`);
      return;
    }
    let afFixtures: AfFixture[];
    try {
      afFixtures = await afFetch<AfFixture>(`/fixtures?date=${day}`);
    } catch (e) {
      console.error(`  [resolve ${day}] failed: ${(e as Error).message}`);
      continue;
    }
    await sleep(1500);

    for (const c of needing.filter((c) => ymd(c.kickoff_at) === day)) {
      const homeAf = c.home_team_id ? teamAf.get(c.home_team_id) : undefined;
      const awayAf = c.away_team_id ? teamAf.get(c.away_team_id) : undefined;
      if (homeAf == null || awayAf == null) continue; // untracked side — can't bridge

      const t = new Date(c.kickoff_at).getTime();
      const match = afFixtures.find(
        (af) =>
          af.teams.home.id === homeAf &&
          af.teams.away.id === awayAf &&
          Math.abs(new Date(af.fixture.date).getTime() - t) <= KICKOFF_WINDOW_MS,
      );
      if (!match) continue;

      c.api_football_id = match.fixture.id;
      const { error } = await supabase
        .from('fixtures')
        .update({ api_football_id: match.fixture.id })
        .eq('id', c.id);
      if (error) console.error(`  [resolve] persist ${c.id} failed: ${error.message}`);
    }
  }
}

type AfEvent = {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number };
  player: { name: string | null };
  assist: { name: string | null };
  type: string; // Goal | Card | subst | Var
  detail: string | null;
};

function normalizeType(t: string): string {
  const lower = t.toLowerCase();
  if (lower === 'subst') return 'subst';
  return lower; // goal | card | var
}

async function syncEvents(fixture: FixtureRow, teamAf: Map<string, number>): Promise<number> {
  const events = await afFetch<AfEvent>(`/fixtures/events?fixture=${fixture.api_football_id}`);
  if (events.length === 0) return 0;

  // Reverse the team bridge so AF team ids map back to our home/away side.
  const homeAf = fixture.home_team_id ? teamAf.get(fixture.home_team_id) : undefined;
  const awayAf = fixture.away_team_id ? teamAf.get(fixture.away_team_id) : undefined;

  const rows = events
    .filter((e) => e.time.elapsed != null)
    .map((e) => {
      const side = e.team.id === homeAf ? 'home' : e.team.id === awayAf ? 'away' : null;
      const teamId =
        side === 'home' ? fixture.home_team_id : side === 'away' ? fixture.away_team_id : null;
      return {
        fixture_id: fixture.id,
        team_id: teamId,
        side,
        minute: e.time.elapsed as number,
        extra_minute: e.time.extra,
        type: normalizeType(e.type),
        detail: e.detail,
        player_name: e.player.name,
        assist_name: e.assist.name,
        updated_at: new Date().toISOString(),
      };
    });

  const { error } = await supabase
    .from('fixture_events')
    .upsert(rows, { onConflict: 'fixture_id,minute,type,player_name' });
  if (error) throw error;
  return rows.length;
}

async function main() {
  if (!AF_TOKEN) throw new Error('API_FOOTBALL_TOKEN required');

  const candidates = await loadCandidates();
  if (candidates.length === 0) {
    console.log('[events] no finished-but-eventless fixtures in the window. done.');
    return;
  }

  const teamIds = Array.from(
    new Set(candidates.flatMap((c) => [c.home_team_id, c.away_team_id]).filter((x): x is string => !!x)),
  );
  const teamAf = await loadTeamAfIds(teamIds);
  console.log(`[events] ${candidates.length} candidate fixtures, ${teamAf.size} teams bridged to API-Football`);

  await resolveAfIds(candidates, teamAf);

  const resolved = candidates.filter((c) => c.api_football_id != null);
  const unresolved = candidates.length - resolved.length;
  if (unresolved > 0) {
    console.log(`[events] ${unresolved} fixture(s) had no API-Football match (untracked team or not on free tier).`);
  }

  let hydrated = 0;
  let totalEvents = 0;
  for (const f of resolved) {
    if (afCalls >= MAX_AF_CALLS) {
      console.log(`[events] free-tier budget reached (${afCalls} calls) — ${resolved.length - hydrated} fixture(s) deferred to next run.`);
      break;
    }
    try {
      const n = await syncEvents(f, teamAf);
      totalEvents += n;
      hydrated++;
      console.log(`  [${f.id}] +${n} events`);
    } catch (e) {
      console.error(`  [${f.id}] events failed: ${(e as Error).message}`);
    }
    await sleep(1500);
  }

  console.log(`[events] done. hydrated ${hydrated} fixtures, ${totalEvents} events, ${afCalls} API-Football calls.`);
}

main().catch((e) => {
  console.error('[events] fatal:', e);
  process.exit(1);
});
