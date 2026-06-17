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
 *   2. For each distinct kickoff day, pull Sportradar's Daily Schedule and match
 *      its sport_events to our fixtures by normalized team name + kickoff window.
 *   3. For each matched fixture, pull the Sport Event Timeline and upsert its
 *      score_change / card / substitution events.
 *
 * Auth: Sportradar uses ?api_key=. Trial access level by default.
 *
 * Usage:
 *   npm run events:sr                  # hydrate finished WC fixtures
 *   npm run events:sr -- --days=30     # widen the lookback (default 14)
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
// ±6h around the provider kickoff absorbs clock drift without colliding with
// another fixture between the same teams (same tolerance as events.ts).
const KICKOFF_WINDOW_MS = 6 * 60 * 60 * 1000;

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
const DUMP = args.includes('--dump');
const DRY = args.includes('--dry');
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

/** Match one of our fixtures to a Sportradar sport_event on that day. */
function matchSportEvent(
  f: FixtureRow,
  events: SrSportEvent[],
  names: Map<string, string>,
): SrSportEvent | null {
  const home = normalizeName(fixtureName(f, 'home', names));
  const away = normalizeName(fixtureName(f, 'away', names));
  if (!home || !away) return null;
  const t = new Date(f.kickoff_at).getTime();

  return (
    events.find((se) => {
      const comps = se.competitors ?? [];
      const set = new Set(comps.map((c) => normalizeName(c.name)));
      const sameTeams = set.has(home) && set.has(away);
      const close = Math.abs(new Date(se.start_time).getTime() - t) <= KICKOFF_WINDOW_MS;
      return sameTeams && close;
    }) ?? null
  );
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
  const ourHome = normalizeName(fixtureName(f, 'home', names));
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

async function main() {
  if (!SR_KEY) throw new Error('SPORTRADAR_API_KEY required');
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

  const days = Array.from(new Set(candidates.map((c) => ymd(c.kickoff_at))));

  // Diagnostic: print one day's raw schedule shape + the team-name strings
  // Sportradar uses, then exit. Use this to confirm the response shape and to
  // build the name alias map for teams that don't normalize-match.
  if (DUMP) {
    const raw = await srFetch<SrSchedule>(`/schedules/${days[0]}/schedules.json`);
    const evs = extractEvents(raw);
    console.log(`top-level keys: ${Object.keys(raw).join(', ')}; extracted ${evs.length} events for ${days[0]}`);

    const comps = Array.from(
      new Set(evs.map((e) => e.sport_event_context?.competition?.name).filter(Boolean)),
    ).sort();
    console.log(`\ncompetitions present (${comps.length}):\n  ${comps.join('\n  ')}`);

    // Does the feed contain the teams we're trying to match on this date?
    const wanted = new Set(
      candidates
        .filter((c) => ymd(c.kickoff_at) === days[0])
        .flatMap((c) => [
          normalizeName(fixtureName(c, 'home', names)),
          normalizeName(fixtureName(c, 'away', names)),
        ]),
    );
    const hits = evs.filter((e) => e.competitors?.some((c) => wanted.has(normalizeName(c.name))));
    console.log(`\nevents matching our ${days[0]} teams: ${hits.length}`);
    console.log(
      JSON.stringify(
        hits.map((e) => ({
          id: e.id,
          start_time: e.start_time,
          competition: e.sport_event_context?.competition?.name,
          competitors: e.competitors?.map((c) => `${c.qualifier}: ${c.name}`),
        })),
        null,
        2,
      ),
    );
    return;
  }

  // Pull one Daily Schedule per distinct kickoff day and index its sport_events.
  const scheduleByDay = new Map<string, SrSportEvent[]>();
  for (const day of days) {
    if (srCalls >= MAX_SR_CALLS) break;
    try {
      const sched = await srFetch<SrSchedule>(`/schedules/${day}/schedules.json`);
      scheduleByDay.set(day, extractEvents(sched));
    } catch (e) {
      console.error(`  [schedule ${day}] failed: ${(e as Error).message}`);
    }
    await sleep(SR_GAP_MS);
  }

  let hydrated = 0;
  let totalEvents = 0;
  let unmatched = 0;
  for (const f of candidates) {
    if (srCalls >= MAX_SR_CALLS) {
      console.log(`[events:sr] trial budget guard hit (${srCalls} calls) — remaining fixtures deferred to next run.`);
      break;
    }
    const se = matchSportEvent(f, scheduleByDay.get(ymd(f.kickoff_at)) ?? [], names);
    if (!se) {
      unmatched++;
      console.log(`  [${f.id}] no Sportradar match for ${fixtureName(f, 'home', names)} vs ${fixtureName(f, 'away', names)} on ${ymd(f.kickoff_at)}`);
      continue;
    }
    try {
      const n = await syncEvents(f, se, names);
      totalEvents += n;
      hydrated++;
      if (!PROBE) console.log(`  [${f.id}] +${n} events`);
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
