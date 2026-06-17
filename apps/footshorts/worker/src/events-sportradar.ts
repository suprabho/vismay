/**
 * Sync World Cup match events (goals, cards, subs) from Sportradar into
 * fixture_events. Trial-scoped: built to validate the timeline end-to-end on a
 * Sportradar 30-day trial key, writing into the same provider-neutral
 * fixture_events table the UI already reads — so it can be swapped for a
 * permanent provider later without touching the schema or MatchTimeline.
 *
 * Scope: World Cup only (COMPETITION_SLUG), which keeps us well inside the
 * trial's 1,000-requests / 30-day, 1-QPS budget.
 *
 * Flow (no id seed — we match by name, unlike events.ts's API-Football bridge):
 *   1. Find finished WC fixtures in the window that have no events yet.
 *   2. Pull the full WC season schedule in ONE call (competition -> 2026 season
 *      -> /seasons/{urn}/schedules) and match our fixtures to its sport_events by
 *      normalized team name. We use the season feed, NOT the per-day schedule —
 *      the daily feed truncates busy days on the trial and silently dropped ~6
 *      matches; the season feed is the complete, authoritative list.
 *   3. For each matched fixture, pull the Sport Event Timeline and upsert its
 *      score_change / card / substitution events.
 *
 * Auth: Sportradar uses ?api_key=. Trial access level by default.
 *
 * Usage:
 *   npm run events:sr                  # hydrate finished WC fixtures
 *   npm run events:sr -- --days=30     # widen the lookback (default 14)
 *   npm run events:sr -- --season      # list the full WC season schedule + exit
 *   npm run events:sr -- --probe       # dump the first matched raw timeline + exit
 *   npm run events:sr -- --dry         # match + parse, don't write
 */

import { createClient } from '@supabase/supabase-js';

const SR_KEY = process.env.SPORTRADAR_API_KEY!;
const SR_ACCESS = process.env.SPORTRADAR_ACCESS_LEVEL ?? 'trial';
const SR_LANG = process.env.SPORTRADAR_LANG ?? 'en';
const SR_BASE = `https://api.sportradar.com/soccer/${SR_ACCESS}/v4/${SR_LANG}`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const COMPETITION_SLUG = 'world-cup';

// Trial is 1 QPS — keep a margin above 1000ms between calls.
const SR_GAP_MS = 1500;
// Hard ceiling on Sportradar calls per run so a bad loop can't drain the
// 1,000-request trial allowance. A full WC group-stage backfill is well under this.
const MAX_SR_CALLS = 150;
// We match WC fixtures by team-pair (unique in the tournament), so the time
// check is only a loose sanity guard against an unrelated rematch in a later
// stage weeks away — 48h is plenty.
const MATCH_WINDOW_MS = 48 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let srCalls = 0;

async function srFetch<T>(path: string): Promise<T> {
  srCalls++;
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${SR_BASE}${path}${sep}api_key=${SR_KEY}`);
  if (!res.ok) {
    throw new Error(`sportradar ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// Normalize team names to compare across providers: lowercase, strip accents and
// non-alphanumerics. National-team names match cleanly; the few that don't
// (e.g. "Korea Republic" vs "South Korea") are logged for a manual alias.
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const args = process.argv.slice(2);
const PROBE = args.includes('--probe');
const DRY = args.includes('--dry');
const SEASON = args.includes('--season');
const daysArg = args.find((a) => a.startsWith('--days='));
const LOOKBACK_DAYS = daysArg ? Number(daysArg.slice('--days='.length)) : 14;

type FixtureRow = {
  id: string;
  kickoff_at: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
};

/** Finished WC fixtures in the window with no events yet (the idempotency gate). */
async function loadCandidates(): Promise<FixtureRow[]> {
  const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: withEvents, error: weErr } = await supabase
    .from('fixture_events')
    .select('fixture_id');
  if (weErr) throw weErr;
  const hydrated = new Set((withEvents ?? []).map((r) => (r as any).fixture_id as string));

  const { data, error } = await supabase
    .from('fixtures')
    .select('id, kickoff_at, home_team_id, away_team_id, home_team_name, away_team_name')
    .eq('competition_slug', COMPETITION_SLUG)
    .eq('status', 'finished')
    .gte('kickoff_at', from)
    .order('kickoff_at', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as FixtureRow[]).filter((f) => !hydrated.has(f.id));
}

/** entity id -> display name, for resolving each fixture's home/away names. */
async function loadTeamNames(teamIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (teamIds.length === 0) return map;
  const { data, error } = await supabase
    .from('entities')
    .select('id, name')
    .in('id', teamIds);
  if (error) throw error;
  for (const e of data ?? []) map.set((e as any).id as string, (e as any).name as string);
  return map;
}

function ymd(iso: string): string {
  return iso.slice(0, 10);
}

function fixtureName(
  f: FixtureRow,
  side: 'home' | 'away',
  names: Map<string, string>,
): string {
  const id = side === 'home' ? f.home_team_id : f.away_team_id;
  const fallback = side === 'home' ? f.home_team_name : f.away_team_name;
  return (id ? names.get(id) : null) ?? fallback ?? '';
}

// ---------------------------------------------------------------------------
// Sportradar shapes (defensive — only the fields we read)
// ---------------------------------------------------------------------------

type SrCompetitor = { id: string; name: string; qualifier: 'home' | 'away' };
type SrSportEvent = {
  id: string;
  start_time: string;
  competitors?: SrCompetitor[];
  sport_event_context?: { competition?: { id?: string; name?: string } };
};
// The Daily Schedules endpoint has shipped in two shapes across versions: a flat
// `sport_events: [...]` and a wrapped `schedules: [{ sport_event: {...} }]`.
// Accept both so we don't depend on which the trial serves.
type SrSchedule = {
  sport_events?: SrSportEvent[];
  schedules?: { sport_event?: SrSportEvent }[];
};

function extractEvents(s: SrSchedule): SrSportEvent[] {
  if (s.sport_events?.length) return s.sport_events;
  if (s.schedules?.length) {
    return s.schedules.map((e) => e.sport_event).filter((x): x is SrSportEvent => !!x);
  }
  return [];
}

// Competitions list — used to discover the FIFA World Cup competition urn.
type SrCompetition = { id: string; name: string; gender?: string };
type SrCompetitionsResponse = { competitions?: SrCompetition[] };

// Competition seasons — used to discover the 2026 season urn at runtime
// (the numeric id is not a stable constant; we read it from `year`/`name`).
type SrSeason = { id: string; name?: string; year?: string };
type SrSeasonsResponse = { seasons?: SrSeason[] };

type SrTimelineEvent = {
  type: string;
  match_time?: number;
  stoppage_time?: number;
  competitor?: 'home' | 'away';
  method?: string; // 'penalty' | 'own_goal'
  player?: { id?: string; name?: string }; // cards
  players?: { id?: string; name?: string; type?: string }[]; // goals / subs
};
type SrTimeline = { timeline?: SrTimelineEvent[] };

// Nations our entities name differently from Sportradar. Keyed by normalized
// (lowercase, no spaces/accents) OUR name → normalized Sportradar name.
const NAME_ALIASES: Record<string, string> = {
  southkorea: 'korearepublic',
  unitedstates: 'usa',
  turkey: 'turkiye',
  capeverdeislands: 'capeverde',
  iran: 'iriran',
  bosniaherzegovina: 'bosniaandherzegovina',
};
function aliasName(n: string): string {
  return NAME_ALIASES[n] ?? n;
}

/**
 * Match a fixture to a Sportradar WC sport_event by team-pair (order-independent),
 * picking the closest kickoff if more than one shares the pairing. No tight time
 * gate — group-stage pairings are unique, so the name set identifies the match.
 */
function matchSportEvent(
  f: FixtureRow,
  wc: SrSportEvent[],
  names: Map<string, string>,
): SrSportEvent | null {
  const home = aliasName(normalizeName(fixtureName(f, 'home', names)));
  const away = aliasName(normalizeName(fixtureName(f, 'away', names)));
  if (!home || !away) return null;
  const t = new Date(f.kickoff_at).getTime();

  const cands = wc.filter((se) => {
    const set = new Set((se.competitors ?? []).map((c) => normalizeName(c.name)));
    return set.has(home) && set.has(away);
  });
  if (cands.length === 0) return null;

  const best = cands.sort(
    (a, b) =>
      Math.abs(new Date(a.start_time).getTime() - t) -
      Math.abs(new Date(b.start_time).getTime() - t),
  )[0]!;
  return Math.abs(new Date(best.start_time).getTime() - t) <= MATCH_WINDOW_MS ? best : null;
}

const RENDERED = new Set(['score_change', 'yellow_card', 'red_card', 'yellow_red_card', 'substitution']);

function mapType(t: string): 'goal' | 'card' | 'subst' {
  if (t === 'score_change') return 'goal';
  if (t === 'substitution') return 'subst';
  return 'card';
}

function cardDetail(t: string): string {
  if (t === 'red_card') return 'Red Card';
  if (t === 'yellow_red_card') return 'Second Yellow Card';
  return 'Yellow Card';
}

function goalDetail(method?: string): string {
  if (method === 'penalty') return 'Penalty';
  if (method === 'own_goal') return 'Own Goal';
  return 'Normal Goal';
}

// Sportradar renders names "Last, First" (e.g. "Jimenez, Raul"). Flip to the
// natural "First Last" the timeline displays.
function formatPlayer(name: string | null | undefined): string | null {
  if (!name) return null;
  const i = name.indexOf(', ');
  return i === -1 ? name : `${name.slice(i + 2)} ${name.slice(0, i)}`.trim();
}

/**
 * Sportradar's event.competitor is 'home'/'away' relative to ITS sport_event.
 * Map that to our home/away side by which SR competitor name matches our home
 * team (providers occasionally disagree on which side is "home").
 */
function srSideToOurs(
  se: SrSportEvent,
  f: FixtureRow,
  names: Map<string, string>,
): { home: 'home' | 'away'; away: 'home' | 'away' } {
  const ourHome = aliasName(normalizeName(fixtureName(f, 'home', names)));
  const srHome = se.competitors?.find((c) => c.qualifier === 'home');
  const srHomeIsOurHome = srHome ? normalizeName(srHome.name) === ourHome : true;
  return srHomeIsOurHome
    ? { home: 'home', away: 'away' }
    : { home: 'away', away: 'home' };
}

async function syncEvents(
  f: FixtureRow,
  se: SrSportEvent,
  names: Map<string, string>,
): Promise<number> {
  const tl = await srFetch<SrTimeline>(`/sport_events/${se.id}/timeline.json`);

  if (PROBE) {
    console.log(`\n----- raw timeline for ${se.id} (${fixtureName(f, 'home', names)} vs ${fixtureName(f, 'away', names)}) -----`);
    console.log(JSON.stringify(tl.timeline?.filter((e) => RENDERED.has(e.type)), null, 2));
    return 0;
  }

  const sideMap = srSideToOurs(se, f, names);
  const rows = (tl.timeline ?? [])
    .filter((e) => RENDERED.has(e.type) && e.match_time != null)
    .map((e) => {
      const type = mapType(e.type);
      const side = e.competitor ? sideMap[e.competitor] : null;
      const teamId = side === 'home' ? f.home_team_id : side === 'away' ? f.away_team_id : null;

      let player_name: string | null = null;
      let assist_name: string | null = null;
      let detail: string | null = null;

      if (type === 'goal') {
        player_name =
          e.players?.find((p) => p.type === 'scorer' || p.type === 'own_goal')?.name ?? null;
        assist_name = e.players?.find((p) => p.type === 'assist')?.name ?? null;
        detail = goalDetail(e.method);
      } else if (type === 'subst') {
        player_name = e.players?.find((p) => p.type === 'substituted_out')?.name ?? null;
        assist_name = e.players?.find((p) => p.type === 'substituted_in')?.name ?? null;
      } else {
        // cards: the booked player is players[0] (no `type`), not a `player` field
        player_name = e.players?.[0]?.name ?? e.player?.name ?? null;
        detail = cardDetail(e.type);
      }

      return {
        fixture_id: f.id,
        team_id: teamId,
        side,
        minute: e.match_time as number,
        extra_minute: e.stoppage_time ?? null,
        type,
        detail,
        player_name: formatPlayer(player_name),
        assist_name: formatPlayer(assist_name),
        updated_at: new Date().toISOString(),
      };
    });

  if (DRY) {
    console.log(`  [${f.id}] would upsert ${rows.length} events (dry)`);
    return rows.length;
  }

  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from('fixture_events')
    .upsert(rows, { onConflict: 'fixture_id,minute,type,player_name' });
  if (error) throw error;
  return rows.length;
}

/**
 * Resolve the FIFA World Cup 2026 season urn, the anchor for the full match list:
 *   1. /competitions.json            -> men's WC urn (sr:competition:16, with a
 *                                       name/gender fallback).
 *   2. /competitions/{urn}/seasons   -> the 2026 season (year/name match; the
 *                                       numeric id isn't a stable constant).
 * Returns null (and logs) if either step fails. Costs 2 Sportradar calls.
 */
async function resolveWcSeason(logPrefix: string): Promise<{ id: string; name: string } | null> {
  const comps = await srFetch<SrCompetitionsResponse>('/competitions.json');
  const competitions = comps.competitions ?? [];
  const wc =
    competitions.find((c) => c.id === 'sr:competition:16') ??
    competitions.find(
      (c) => /world cup/i.test(c.name) && (c.gender ?? 'men').toLowerCase() === 'men',
    );
  if (!wc) {
    console.error(`${logPrefix} FIFA World Cup competition not found in /competitions.json`);
    return null;
  }
  await sleep(SR_GAP_MS);
  const seasonsRes = await srFetch<SrSeasonsResponse>(`/competitions/${wc.id}/seasons.json`);
  const seasons = seasonsRes.seasons ?? [];
  const season =
    seasons.find((s) => s.year === '2026') ?? seasons.find((s) => /2026/.test(s.name ?? ''));
  if (!season) {
    console.error(
      `${logPrefix} no 2026 season for ${wc.id}. Seasons seen: ${
        seasons.map((s) => `${s.id} ${s.name ?? ''}`).join(' | ') || 'none'
      }`,
    );
    return null;
  }
  return { id: season.id, name: season.name ?? season.year ?? '2026' };
}

/**
 * Diagnostic: list the authoritative full WC season schedule (one un-paginated
 * call, limit default 1000 >> 104 matches), then exit — writes nothing. This is
 * the same feed the real run now uses; --season just prints it.
 */
async function runSeasonProbe(): Promise<void> {
  const season = await resolveWcSeason('[events:sr --season]');
  if (!season) return;
  console.log(`[events:sr --season] season: ${season.id} (${season.name})`);
  await sleep(SR_GAP_MS);

  const sched = await srFetch<SrSchedule>(`/seasons/${season.id}/schedules.json`);
  const events = extractEvents(sched).sort((a, b) => a.start_time.localeCompare(b.start_time));

  console.log(`\nSeason schedule for ${season.id} — ${events.length} matches:`);
  for (const e of events) {
    console.log(`  ${e.start_time}  ${e.competitors?.map((c) => c.name).join(' v ') ?? '?'}`);
  }
  console.log(`\n[events:sr --season] done. ${events.length} matches (${srCalls} Sportradar calls).`);
}

async function main() {
  if (!SR_KEY) throw new Error('SPORTRADAR_API_KEY required');

  // Independent coverage test — Season Schedule path only, no Supabase needed.
  if (SEASON) {
    await runSeasonProbe();
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }

  const candidates = await loadCandidates();
  if (candidates.length === 0) {
    console.log(`[events:sr] no finished-but-eventless ${COMPETITION_SLUG} fixtures in the last ${LOOKBACK_DAYS}d. done.`);
    return;
  }

  const teamIds = Array.from(
    new Set(candidates.flatMap((c) => [c.home_team_id, c.away_team_id]).filter((x): x is string => !!x)),
  );
  const names = await loadTeamNames(teamIds);
  console.log(`[events:sr] ${candidates.length} candidate WC fixtures (access=${SR_ACCESS}, lookback=${LOOKBACK_DAYS}d)`);

  // Pull the full WC season schedule in ONE call — the authoritative, complete
  // match list. We deliberately do NOT use the per-day schedule feed: it
  // truncates busy days on the trial, which silently dropped ~6 matches.
  const season = await resolveWcSeason('[events:sr]');
  if (!season) return;
  await sleep(SR_GAP_MS);
  const sched = await srFetch<SrSchedule>(`/seasons/${season.id}/schedules.json`);
  const wcEvents = extractEvents(sched);
  console.log(`[events:sr] season ${season.id} (${season.name}): ${wcEvents.length} WC matches`);

  let hydrated = 0;
  let totalEvents = 0;
  let unmatched = 0;
  for (const f of candidates) {
    if (srCalls >= MAX_SR_CALLS) {
      console.log(`[events:sr] trial budget guard hit (${srCalls} calls) — remaining fixtures deferred to next run.`);
      break;
    }
    const se = matchSportEvent(f, wcEvents, names);
    if (!se) {
      unmatched++;
      // Show the WC fixtures within ~18h so we can read Sportradar's exact team
      // names and add aliases for the ones that don't normalize-match.
      const near = wcEvents
        .filter(
          (e) =>
            Math.abs(new Date(e.start_time).getTime() - new Date(f.kickoff_at).getTime()) <=
            18 * 60 * 60 * 1000,
        )
        .map((e) => e.competitors?.map((c) => c.name).join(' v '));
      console.log(
        `  [${f.id}] no SR match: ${fixtureName(f, 'home', names)} vs ${fixtureName(f, 'away', names)} (${ymd(f.kickoff_at)}). Nearby WC: ${near.join(' | ') || 'none'}`,
      );
      continue;
    }
    try {
      const n = await syncEvents(f, se, names);
      totalEvents += n;
      hydrated++;
      if (!PROBE && !DRY) console.log(`  [${f.id}] +${n} events`);
    } catch (e) {
      console.error(`  [${f.id}] timeline failed: ${(e as Error).message}`);
    }
    await sleep(SR_GAP_MS);
    if (PROBE && hydrated >= 1) break; // one raw dump is enough
  }

  console.log(
    `[events:sr] done. hydrated ${hydrated}, ${totalEvents} events, ${unmatched} unmatched, ${srCalls} Sportradar calls.`,
  );
}

main().catch((e) => {
  console.error('[events:sr] fatal:', e);
  process.exit(1);
});
