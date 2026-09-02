/**
 * Opta match-facts ingest (theanalyst.com match centre).
 *
 * Two phases per tracked competition (theanalyst/competitions.ts):
 *
 *   1. DISCOVERY — fixtures that finished recently but have no
 *      theanalyst_match_id yet are matched against the competition's
 *      match-centre listing by (home team, away team, kickoff ±1 day), and the
 *      resolved ids are persisted onto the fixtures row. One-time cost per
 *      fixture (theanalyst_match_id is unique; only null rows are considered).
 *
 *   2. SCRAPE — finished fixtures that have a theanalyst_match_id but no
 *      opta_match_facts rows get their match-centre page scraped and the
 *      per-side stats upserted on (fixture_id, side), so cron re-runs are
 *      idempotent. The SAME render also yields the match timeline
 *      (matchCentre.ts's extractMatchEvents — selectors still unverified),
 *      written into fixture_events as a strict gap-fill: only fixtures with
 *      zero existing events get rows, mirroring events.ts's "no events yet"
 *      gate so the API-Football/Sportradar writers and this one never
 *      double-write. --events-backfill opts stats-done, events-missing
 *      fixtures into a re-scrape to drain the backlog.
 *
 * A third, manual mode — --fixture-id=<uuid> — narrows both phases to one
 * fixture and always attempts it (bypassing the "already done"/gap-fill
 * skip gates), writing ONLY its goal events. This is what the share-card
 * studio's Match Timeline layer editor's "Extract goals now" button
 * dispatches, for an immediate single-fixture result instead of waiting on
 * the cron. Requires --competition alongside it (discovery needs to know
 * which theanalyst.com competition to search).
 *
 * Deterministic parsing throughout — no Gemini. Runs every 3h, 30min after
 * the scores refresh flips fixtures to 'finished'
 * (.github/workflows/footshorts-theanalyst-match-facts.yml).
 *
 * Usage:
 *   npm run match-facts                # all tracked competitions
 *   npm run match-facts -- --competition=premier-league
 *   npm run match-facts -- --dry       # discover + scrape, print, no writes
 *   npm run match-facts -- --dry --dump-events   # + Opta DOM dump (selector debugging)
 *   npm run match-facts -- --events-backfill     # re-scrape stats-done fixtures lacking events
 *   npm run match-facts -- --competition=premier-league --fixture-id=<uuid>  # manual, goals only
 */

import { createClient } from '@supabase/supabase-js';
import { THEANALYST_COMPETITIONS, TheanalystCompetition } from './theanalyst/competitions';
import { discoverMatchesForCompetition, matchFixtures, UnmappedFixture } from './theanalyst/matchDiscovery';
import { fetchMatchFacts, type MatchEvent } from './theanalyst/matchCentre';
import { closeBrowser } from './theanalyst/fetch';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// Only look at fixtures from the trailing month: older gaps are almost always
// pre-integration history, and bounding the window keeps discovery/scrape runs
// small and polite.
const LOOKBACK_DAYS = 30;

// Match-centre pages scraped per run, across competitions. The 3-hourly cron
// drains any backlog; a matchday burst never turns into a request burst.
const MAX_SCRAPES_PER_RUN = 20;

function parseArgs(argv: string[]): {
  competition: string | null;
  dry: boolean;
  dumpEvents: boolean;
  eventsBackfill: boolean;
  fixtureId: string | null;
} {
  let competition: string | null = null;
  let dry = false;
  let dumpEvents = false;
  let eventsBackfill = false;
  let fixtureId: string | null = null;
  for (const a of argv) {
    if (a.startsWith('--competition=')) competition = a.slice('--competition='.length) || null;
    else if (a === '--dry') dry = true;
    // Print the match-centre widget's Opta class inventory + unparsed regions
    // per scraped page — the selector-debugging aid for the (still unverified)
    // event extractor. See matchCentre.ts's match-events section.
    else if (a === '--dump-events') dumpEvents = true;
    // Also re-scrape fixtures whose stats are already in opta_match_facts but
    // that have no fixture_events rows yet — the one-time backlog drain after
    // the events extractor lands. Off by default so a fixture whose page
    // genuinely yields no events can't be re-scraped every cron run forever.
    else if (a === '--events-backfill') eventsBackfill = true;
    // Manual single-fixture mode (the studio's "Extract goals now" button) —
    // see the module doc comment.
    else if (a.startsWith('--fixture-id=')) fixtureId = a.slice('--fixture-id='.length) || null;
    else console.warn(`[match-facts] ignoring unknown arg: ${a}`);
  }
  return { competition, dry, dumpEvents, eventsBackfill, fixtureId };
}

type FixtureRow = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  kickoff_at: string;
  theanalyst_match_id: string | null;
};

/** entities(id) → name, for fixtures that reference seeded teams. */
async function loadTeamNames(fixtures: FixtureRow[]): Promise<Map<string, string>> {
  const ids = [
    ...new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]).filter((id): id is string => !!id)),
  ];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('entities').select('id, name').in('id', ids);
  if (error) throw new Error(`entities lookup failed: ${error.message}`);
  return new Map((data ?? []).map((e) => [e.id, e.name]));
}

function sideName(teamId: string | null, teamName: string | null, names: Map<string, string>): string | null {
  return (teamId ? names.get(teamId) : null) ?? teamName;
}

async function discoverForCompetition(
  comp: TheanalystCompetition,
  dry: boolean,
  fixtureId?: string | null
): Promise<number> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  let query = supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, theanalyst_match_id')
    .eq('competition_slug', comp.competitionSlug)
    .is('theanalyst_match_id', null)
    .in('status', ['finished', 'live'])
    .gte('kickoff_at', since);
  if (fixtureId) query = query.eq('id', fixtureId);
  const { data, error } = await query;
  if (error) throw new Error(`fixtures query failed: ${error.message}`);

  const rows = (data ?? []) as FixtureRow[];
  if (rows.length === 0) return 0;

  const names = await loadTeamNames(rows);
  const unmapped: UnmappedFixture[] = [];
  for (const f of rows) {
    const home = sideName(f.home_team_id, f.home_team_name, names);
    const away = sideName(f.away_team_id, f.away_team_name, names);
    if (home && away) {
      unmapped.push({ id: f.id, homeTeamName: home, awayTeamName: away, kickoffAt: f.kickoff_at });
    }
  }
  if (unmapped.length === 0) return 0;

  const candidates = await discoverMatchesForCompetition(comp.theanalystSlug, LOOKBACK_DAYS);
  const resolved = matchFixtures(candidates, unmapped);
  console.log(
    `[match-facts] ${comp.competitionSlug}: ${unmapped.length} unmapped fixtures, ${candidates.length} listed matches, ${resolved.size} newly resolved`
  );
  if (dry) return resolved.size;

  for (const [resolvedFixtureId, m] of resolved) {
    const { error: updateError } = await supabase
      .from('fixtures')
      .update({
        theanalyst_match_id: m.matchId,
        theanalyst_competition_id: m.competitionId,
        theanalyst_season_id: m.seasonId,
        theanalyst_match_url: m.url,
      })
      .eq('id', resolvedFixtureId);
    if (updateError) {
      console.error(`[match-facts] mapping persist failed for fixture ${resolvedFixtureId}: ${updateError.message}`);
    }
  }
  return resolved.size;
}

/**
 * Which of `fixtureIds` already have ANY fixture_events rows. Scoped to the
 * candidate ids and paged — an unscoped `select('fixture_id')` tops out at
 * PostgREST's max_rows (1000) and silently truncates once the table outgrows
 * it, making hydrated fixtures look eventless (same pitfall as
 * content-source's fetchMatchtimeCoverage works around).
 */
async function loadFixturesWithEvents(fixtureIds: string[]): Promise<Set<string>> {
  const has = new Set<string>();
  if (fixtureIds.length === 0) return has;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('fixture_events')
      .select('fixture_id')
      .in('fixture_id', fixtureIds)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fixture_events query failed: ${error.message}`);
    for (const r of data ?? []) has.add((r as { fixture_id: string }).fixture_id);
    if (!data || data.length < PAGE) break;
  }
  return has;
}

async function scrapeForCompetition(
  comp: TheanalystCompetition,
  budget: { remaining: number },
  opts: { dry: boolean; dumpEvents: boolean; eventsBackfill: boolean; fixtureId?: string | null }
): Promise<number> {
  const { dry, dumpEvents, eventsBackfill, fixtureId } = opts;
  // Manual single-fixture mode always attempts the one fixture, bypassing the
  // "already done"/gap-fill skip gates below — a user clicking the button
  // expects an immediate attempt, not a silent no-op because an earlier
  // automated run already touched this fixture.
  const forced = Boolean(fixtureId);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  let query = supabase
    .from('fixtures')
    .select(
      'id, theanalyst_match_id, theanalyst_competition_id, theanalyst_season_id, home_team_id, away_team_id'
    )
    .eq('competition_slug', comp.competitionSlug)
    .not('theanalyst_match_id', 'is', null)
    .eq('status', 'finished')
    .gte('kickoff_at', since);
  if (fixtureId) query = query.eq('id', fixtureId);
  const { data, error } = await query;
  if (error) throw new Error(`fixtures query failed: ${error.message}`);

  const mapped = (data ?? []) as Array<{
    id: string;
    theanalyst_match_id: string;
    theanalyst_competition_id: string | null;
    theanalyst_season_id: string | null;
    home_team_id: string | null;
    away_team_id: string | null;
  }>;
  if (mapped.length === 0) return 0;

  const { data: existing, error: existingError } = await supabase
    .from('opta_match_facts')
    .select('fixture_id')
    .in('fixture_id', mapped.map((f) => f.id));
  if (existingError) throw new Error(`opta_match_facts query failed: ${existingError.message}`);
  const done = new Set((existing ?? []).map((r) => r.fixture_id));

  const hasEvents = await loadFixturesWithEvents(mapped.map((f) => f.id));

  let scraped = 0;
  let eventsWritten = 0;
  for (const fixture of mapped) {
    // Stats drive the scrape gate, exactly as before; --events-backfill
    // additionally opts stats-done fixtures that still lack events into a
    // re-scrape (bounded by the same per-run budget). Manual single-fixture
    // mode (forced) ignores both gates.
    const needsStats = forced || !done.has(fixture.id);
    const needsEvents = forced || (eventsBackfill && !hasEvents.has(fixture.id));
    if (!needsStats && !needsEvents) continue;
    if (budget.remaining <= 0) {
      console.log('[match-facts] per-run scrape budget exhausted — remaining fixtures wait for the next run');
      break;
    }
    budget.remaining--;

    if (!fixture.theanalyst_competition_id || !fixture.theanalyst_season_id) {
      // Shouldn't happen — discovery always persists both alongside the
      // matchId — but guard rather than pass 'null' into a URL.
      console.error(`[match-facts] fixture ${fixture.id} has a matchId but no competitionId/seasonId — skipping`);
      continue;
    }

    let facts;
    try {
      facts = await fetchMatchFacts(
        fixture.theanalyst_competition_id,
        fixture.theanalyst_season_id,
        fixture.theanalyst_match_id,
        { dumpEvents }
      );
    } catch (e: any) {
      console.error(`[match-facts] scrape failed for fixture ${fixture.id}: ${e.message ?? e}`);
      continue;
    }

    if (dry) {
      // `facts` includes the parsed `events` array, so a dry run shows both.
      console.log(`[match-facts] (dry) fixture ${fixture.id}:`, JSON.stringify(facts));
      scraped++;
      continue;
    }

    const now = new Date().toISOString();
    // On a backfill-only pass this re-upserts (refreshes) already-stored stats
    // from the same render — idempotent on (fixture_id, side), so one write
    // path stays simpler than gating it.
    const { error: upsertError } = await supabase.from('opta_match_facts').upsert(
      (['home', 'away'] as const).map((side) => ({
        fixture_id: fixture.id,
        side,
        theanalyst_match_id: fixture.theanalyst_match_id,
        ...facts[side],
        scraped_at: now,
        updated_at: now,
      })),
      { onConflict: 'fixture_id,side' }
    );
    if (upsertError) {
      console.error(`[match-facts] upsert failed for fixture ${fixture.id}: ${upsertError.message}`);
      continue;
    }
    scraped++;

    // Timeline events: mutual gap-fill with the API-Football/Sportradar
    // writers — write only while the fixture has ZERO fixture_events rows
    // (mirrors events.ts's own "no events yet" gate, so neither side ever
    // double-writes; first writer wins). Manual single-fixture mode instead
    // always attempts a write, narrowed to goals only — safe/idempotent via
    // the upsert's natural key (colliding keys just overwrite, non-colliding
    // keys genuinely fill a gap against pre-existing rows).
    const eventsForWrite = forced ? facts.events.filter((e) => e.type === 'goal') : facts.events;
    if ((forced || !hasEvents.has(fixture.id)) && eventsForWrite.length > 0) {
      const n = await writeFixtureEvents(fixture, eventsForWrite, now, { force: forced });
      if (n > 0) {
        eventsWritten += n;
        hasEvents.add(fixture.id);
        console.log(
          `[match-facts] fixture ${fixture.id}: +${n} timeline event(s)${forced ? ' (manual, goals only)' : ''}`
        );
      }
    } else if (forced) {
      // Distinguish "no goals in this match" from "the extractor found
      // nothing at all" for whoever checks the Action log after clicking
      // the button.
      console.log(
        `[match-facts] fixture ${fixture.id}: 0 goal event(s) parsed (${facts.events.length} total event(s) found)`
      );
    }
  }

  console.log(
    `[match-facts] ${comp.competitionSlug}: scraped ${scraped} match(es), wrote ${eventsWritten} timeline event(s)`
  );
  return scraped;
}

/**
 * Insert a fixture's Opta timeline into fixture_events. Returns rows written
 * (0 on skip/failure). Gap-fill by default: a freshness re-check right
 * before the write shrinks the race against a manual events.ts run
 * from run-length to seconds — and since both writers upsert on the same
 * natural key, even a lost race degrades to idempotent overwrites rather
 * than duplicates (modulo provider name-spelling drift). `opts.force` skips
 * that pre-check entirely (the manual single-fixture button always wants an
 * attempt, and the same natural-key upsert keeps it safe against whatever's
 * already there).
 */
async function writeFixtureEvents(
  fixture: { id: string; home_team_id: string | null; away_team_id: string | null },
  events: MatchEvent[],
  now: string,
  opts?: { force?: boolean }
): Promise<number> {
  if (!opts?.force) {
    const { count, error: cntError } = await supabase
      .from('fixture_events')
      .select('id', { count: 'exact', head: true })
      .eq('fixture_id', fixture.id);
    if (cntError) {
      console.error(`[match-facts] events pre-check failed for fixture ${fixture.id}: ${cntError.message}`);
      return 0;
    }
    if ((count ?? 0) > 0) return 0;
  }

  // Dedupe within the batch on the table's natural key — two rows sharing
  // (minute, type, player) in one upsert abort the whole statement ("ON
  // CONFLICT ... cannot affect row a second time"). extra_minute isn't part of
  // the key, so a 90' and a 90+3' goal by the same player collapse to one row
  // — a schema trade-off the API-Football writer shares.
  const byKey = new Map<string, Record<string, unknown>>();
  for (const e of events) {
    byKey.set(`${e.minute}|${e.type}|${e.playerName ?? ''}`, {
      fixture_id: fixture.id,
      team_id: e.side === 'home' ? fixture.home_team_id : fixture.away_team_id,
      side: e.side,
      minute: e.minute,
      extra_minute: e.extraMinute,
      type: e.type,
      detail: e.detail,
      player_name: e.playerName,
      assist_name: e.assistName,
      updated_at: now,
    });
  }
  const rows = [...byKey.values()];

  const { error } = await supabase
    .from('fixture_events')
    .upsert(rows, { onConflict: 'fixture_id,minute,type,player_name' });
  if (error) {
    console.error(`[match-facts] events upsert failed for fixture ${fixture.id}: ${error.message}`);
    return 0;
  }
  return rows.length;
}

async function run() {
  const { competition, dry, dumpEvents, eventsBackfill, fixtureId } = parseArgs(process.argv.slice(2));
  if (fixtureId && !competition) {
    throw new Error('--fixture-id requires --competition=<slug> (a single-fixture run must target exactly one competition)');
  }
  const comps = THEANALYST_COMPETITIONS.filter(
    (c) => !competition || c.competitionSlug === competition
  );
  if (comps.length === 0) {
    console.log(
      `[match-facts] no tracked theanalyst competitions${competition ? ` matching '${competition}'` : ''} — populate theanalyst/competitions.ts`
    );
    return;
  }

  const budget = { remaining: MAX_SCRAPES_PER_RUN };
  for (const comp of comps) {
    await discoverForCompetition(comp, dry, fixtureId);
    await scrapeForCompetition(comp, budget, { dry, dumpEvents, eventsBackfill, fixtureId });
  }
}

run()
  .then(() => closeBrowser())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('fatal:', e);
    closeBrowser().finally(() => process.exit(1));
  });
