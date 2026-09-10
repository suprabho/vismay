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
 * A fourth mode — --url=<theanalyst match-centre link> — scrapes ONE match
 * straight from a pasted URL (the admin Match facts tab's "Scrape from URL"
 * form; also `theanalyst.com/opta-football-match-centre?competitionId=…&
 * seasonId=…&matchId=…` copied from the site). No discovery, no competition
 * needed: the widget's own scoreboard (team names + date) is matched against
 * fixtures the same way discovery does; --fixture-id pins it explicitly.
 * A match with no fixtures row at all (a competition football-data doesn't
 * cover) gets a minimal fixtures row created from the scoreboard so its
 * facts have somewhere to land. Writes stats + full timeline (gap-fill).
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
 *   npm run match-facts -- --url='https://theanalyst.com/opta-football-match-centre?competitionId=…&seasonId=…&matchId=…'
 *   npm run match-facts -- --url=… --fixture-id=<uuid>   # pin the fixture instead of matching by teams/date
 */

import { createClient } from '@supabase/supabase-js';
import { THEANALYST_COMPETITIONS, TheanalystCompetition } from './theanalyst/competitions';
import {
  discoverMatchesForCompetition,
  matchFixtures,
  theanalystMatchUrl,
  UnmappedFixture,
} from './theanalyst/matchDiscovery';
import {
  fetchMatchFacts,
  parseMatchCentreUrl,
  type MatchCentreData,
  type MatchEvent,
  type MatchHeader,
} from './theanalyst/matchCentre';
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
  url: string | null;
} {
  let competition: string | null = null;
  let dry = false;
  let dumpEvents = false;
  let eventsBackfill = false;
  let fixtureId: string | null = null;
  let url: string | null = null;
  for (const a of argv) {
    if (a.startsWith('--competition=')) competition = a.slice('--competition='.length) || null;
    // Single pasted match-centre link — see the module doc comment.
    else if (a.startsWith('--url=')) url = a.slice('--url='.length).trim() || null;
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
  return { competition, dry, dumpEvents, eventsBackfill, fixtureId, url };
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
    const upsertError = await upsertMatchFacts(fixture.id, fixture.theanalyst_match_id, facts, now);
    if (upsertError) {
      console.error(`[match-facts] upsert failed for fixture ${fixture.id}: ${upsertError}`);
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

/** Per-side stats upsert on (fixture_id, side). Returns an error message or null. */
async function upsertMatchFacts(
  fixtureId: string,
  theanalystMatchId: string,
  facts: MatchCentreData,
  now: string
): Promise<string | null> {
  const { error } = await supabase.from('opta_match_facts').upsert(
    (['home', 'away'] as const).map((side) => ({
      fixture_id: fixtureId,
      side,
      theanalyst_match_id: theanalystMatchId,
      ...facts[side],
      scraped_at: now,
      updated_at: now,
    })),
    { onConflict: 'fixture_id,side' }
  );
  return error ? error.message : null;
}

// ── --url mode ───────────────────────────────────────────────────────────────

type UrlFixtureRow = FixtureRow & {
  competition_slug: string;
  theanalyst_competition_id: string | null;
  theanalyst_season_id: string | null;
};

const URL_FIXTURE_COLUMNS =
  'id, competition_slug, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, theanalyst_match_id, theanalyst_competition_id, theanalyst_season_id';

/**
 * Opta's competition display names (as the match-centre scoreboard prints
 * them) → our competition_slug, for the fixtures row --url mode creates when
 * a match has no row yet. Anything unlisted falls back to a slugified name,
 * so an untracked competition still lands (just under a slug nobody has
 * seeded yet — the admin tab's competition list shows whatever is there).
 */
const OPTA_COMPETITION_SLUGS: Record<string, string> = {
  'uefa champions league': 'champions-league',
  'champions league': 'champions-league',
  'uefa europa league': 'europa-league',
  'europa league': 'europa-league',
  'uefa europa conference league': 'conference-league',
  'uefa conference league': 'conference-league',
  'premier league': 'premier-league',
  'la liga': 'primera-division',
  'laliga': 'primera-division',
  'primera division': 'primera-division',
  'serie a': 'serie-a',
  'bundesliga': 'bundesliga',
  'ligue 1': 'ligue-1',
  'primeira liga': 'primeira-liga',
  'eredivisie': 'eredivisie',
  'fa cup': 'fa-cup',
  'efl cup': 'efl-cup',
  'carabao cup': 'efl-cup',
};

function competitionSlugFromOptaName(name: string | null): string {
  const key = (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!key) return 'unknown';
  return OPTA_COMPETITION_SLUGS[key] ?? key.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** fixtures.season convention (fixtures.ts normalizeSeason): "26-27" for a
 *  European season starting in July+; a Jan-Jun date belongs to the prior. */
function seasonFromDate(isoDate: string): string {
  const [y = 0, m = 0] = isoDate.split('-').map(Number);
  const startYear = m >= 7 ? y : y - 1;
  const yy = (n: number) => String(n % 100).padStart(2, '0');
  return `${yy(startYear)}-${yy(startYear + 1)}`;
}

async function loadFixtureById(id: string): Promise<UrlFixtureRow | null> {
  const { data, error } = await supabase.from('fixtures').select(URL_FIXTURE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`fixtures lookup failed: ${error.message}`);
  return (data as UrlFixtureRow | null) ?? null;
}

async function findFixtureByMatchId(matchId: string): Promise<UrlFixtureRow | null> {
  const { data, error } = await supabase
    .from('fixtures')
    .select(URL_FIXTURE_COLUMNS)
    .eq('theanalyst_match_id', matchId)
    .maybeSingle();
  if (error) throw new Error(`fixtures lookup failed: ${error.message}`);
  return (data as UrlFixtureRow | null) ?? null;
}

/**
 * Scoreboard → fixtures row, by team names + date, reusing discovery's
 * matcher (matchFixtures) so "AEK Athens FC" finds "PAE AEK" the same way
 * it does on the cron. Any competition — the pasted link IS the scope.
 * Exactly one hit resolves; several (a doubleheader oddity, duplicated
 * rows) is an error asking for --fixture-id rather than a guess.
 */
async function findFixtureByHeader(header: MatchHeader, matchId: string, competitionId: string, seasonId: string): Promise<UrlFixtureRow | null> {
  if (!header.matchDate) return null;
  const day = Date.parse(`${header.matchDate}T00:00:00Z`);
  const from = new Date(day - 86400000).toISOString();
  const to = new Date(day + 2 * 86400000).toISOString();
  const { data, error } = await supabase
    .from('fixtures')
    .select(URL_FIXTURE_COLUMNS)
    .gte('kickoff_at', from)
    .lt('kickoff_at', to);
  if (error) throw new Error(`fixtures query failed: ${error.message}`);
  const rows = (data ?? []) as UrlFixtureRow[];
  if (rows.length === 0) return null;

  const names = await loadTeamNames(rows);
  const unmapped: UnmappedFixture[] = [];
  for (const f of rows) {
    const home = sideName(f.home_team_id, f.home_team_name, names);
    const away = sideName(f.away_team_id, f.away_team_name, names);
    if (home && away) unmapped.push({ id: f.id, homeTeamName: home, awayTeamName: away, kickoffAt: f.kickoff_at });
  }
  const resolved = matchFixtures(
    [
      {
        matchId,
        competitionId,
        seasonId,
        homeTeamRaw: header.homeTeamName,
        awayTeamRaw: header.awayTeamName,
        kickoffDate: header.matchDate,
      },
    ],
    unmapped
  );
  const hits = [...resolved.keys()];
  if (hits.length > 1) {
    throw new Error(
      `${header.homeTeamName} vs ${header.awayTeamName} on ${header.matchDate} matches ${hits.length} fixtures (${hits.join(', ')}) — re-run with --fixture-id=<uuid>`
    );
  }
  return hits.length === 1 ? rows.find((r) => r.id === hits[0]) ?? null : null;
}

/**
 * Minimal fixtures row for a match football-data doesn't give us — raw team
 * names (no entity ids, same as early cup rounds vs untracked clubs), the
 * scoreboard's date at noon UTC (the widget prints no kickoff time), scores
 * from the scoreboard, status 'finished'. football_data_id stays null, so a
 * later football-data ingest of the same competition would NOT dedupe
 * against it — only create when nothing matched, and say so loudly.
 */
async function createFixtureFromHeader(header: MatchHeader, ids: { matchId: string; competitionId: string; seasonId: string }, url: string): Promise<UrlFixtureRow> {
  if (!header.matchDate) throw new Error('scoreboard has no parseable date — cannot create a fixtures row; pass --fixture-id');
  const row = {
    competition_slug: competitionSlugFromOptaName(header.competitionName),
    season: seasonFromDate(header.matchDate),
    home_team_name: header.homeTeamName,
    away_team_name: header.awayTeamName,
    kickoff_at: `${header.matchDate}T12:00:00Z`,
    status: 'finished',
    home_score: header.homeScore,
    away_score: header.awayScore,
    home_ht_score: header.homeHtScore,
    away_ht_score: header.awayHtScore,
    theanalyst_match_id: ids.matchId,
    theanalyst_competition_id: ids.competitionId,
    theanalyst_season_id: ids.seasonId,
    theanalyst_match_url: url,
  };
  const { data, error } = await supabase.from('fixtures').insert(row).select(URL_FIXTURE_COLUMNS).single();
  if (error || !data) throw new Error(`fixture insert failed: ${error?.message ?? 'no row returned'}`);
  console.log(
    `[match-facts] created fixture ${data.id} (${row.competition_slug} ${row.season}: ${row.home_team_name} ${row.home_score ?? '?'}-${row.away_score ?? '?'} ${row.away_team_name}, ${header.matchDate}) — no existing fixtures row matched`
  );
  return data as UrlFixtureRow;
}

async function scrapeFromUrl(
  rawUrl: string,
  opts: { fixtureId: string | null; dry: boolean; dumpEvents: boolean }
): Promise<void> {
  const { fixtureId, dry, dumpEvents } = opts;
  const ids = parseMatchCentreUrl(rawUrl);
  if (!ids) {
    throw new Error(`--url is not a theanalyst.com match URL (needs competitionId, seasonId and matchId query params): ${rawUrl}`);
  }
  console.log(`[match-facts] url mode: match ${ids.matchId} (competition ${ids.competitionId}, season ${ids.seasonId})`);

  // Scrape first — the scoreboard is what identifies the match.
  const facts = await fetchMatchFacts(ids.competitionId, ids.seasonId, ids.matchId, { dumpEvents });
  const header = facts.header;
  if (header) {
    console.log(
      `[match-facts] scoreboard: ${header.homeTeamName} ${header.homeScore ?? '?'}-${header.awayScore ?? '?'} ${header.awayTeamName} · ${header.competitionName ?? 'unknown competition'} · ${header.matchDate ?? 'unknown date'}`
    );
  } else {
    console.warn('[match-facts] scoreboard not parsed — fixture can only be resolved by --fixture-id or an already-linked theanalyst_match_id');
  }

  // Resolve the fixtures row: explicit → already linked → scoreboard match → create.
  let fixture: UrlFixtureRow | null = null;
  if (fixtureId) {
    fixture = await loadFixtureById(fixtureId);
    if (!fixture) throw new Error(`fixture ${fixtureId} not found`);
  } else {
    fixture = await findFixtureByMatchId(ids.matchId);
    if (fixture) console.log(`[match-facts] fixture ${fixture.id} already linked to this match`);
    else if (header) {
      fixture = await findFixtureByHeader(header, ids.matchId, ids.competitionId, ids.seasonId);
      if (fixture) console.log(`[match-facts] matched fixture ${fixture.id} (${fixture.competition_slug}) by team names + date`);
    }
  }

  if (dry) {
    console.log(
      `[match-facts] (dry) ${fixture ? `fixture ${fixture.id}` : 'no fixture — would create one from the scoreboard'}:`,
      JSON.stringify(facts)
    );
    return;
  }

  const now = new Date().toISOString();
  const storedUrl = rawUrl.includes('dataviz.theanalyst.com')
    ? theanalystMatchUrl(ids.competitionId, ids.seasonId, ids.matchId)
    : rawUrl;

  if (!fixture) {
    if (!header) throw new Error('no fixture matched and no scoreboard to create one from — pass --fixture-id');
    fixture = await createFixtureFromHeader(header, ids, storedUrl);
  } else if (fixture.theanalyst_match_id !== ids.matchId) {
    // Link (or re-link — a pasted URL is an explicit editorial correction).
    if (fixture.theanalyst_match_id) {
      console.warn(`[match-facts] fixture ${fixture.id} was linked to ${fixture.theanalyst_match_id}; relinking to ${ids.matchId}`);
    }
    const { error } = await supabase
      .from('fixtures')
      .update({
        theanalyst_match_id: ids.matchId,
        theanalyst_competition_id: ids.competitionId,
        theanalyst_season_id: ids.seasonId,
        theanalyst_match_url: storedUrl,
      })
      .eq('id', fixture.id);
    if (error) {
      throw new Error(
        `linking fixture ${fixture.id} to match ${ids.matchId} failed: ${error.message}` +
          (error.message.includes('unique') ? ' (another fixture already holds this theanalyst_match_id)' : '')
      );
    }
    console.log(`[match-facts] linked fixture ${fixture.id} → ${ids.matchId}`);
  }

  const upsertError = await upsertMatchFacts(fixture.id, ids.matchId, facts, now);
  if (upsertError) throw new Error(`upsert failed for fixture ${fixture.id}: ${upsertError}`);
  console.log(`[match-facts] fixture ${fixture.id}: stats written (${Object.keys(facts.home.raw_stats).length} raw stats/side)`);

  // Timeline: same strict gap-fill as the cron (first writer wins), full
  // event set — writeFixtureEvents re-checks for existing rows itself.
  if (facts.events.length > 0) {
    const n = await writeFixtureEvents(fixture, facts.events, now);
    console.log(
      n > 0
        ? `[match-facts] fixture ${fixture.id}: +${n} timeline event(s)`
        : `[match-facts] fixture ${fixture.id}: ${facts.events.length} event(s) parsed, none written (fixture already has events)`
    );
  } else {
    console.log(`[match-facts] fixture ${fixture.id}: no timeline events parsed`);
  }
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
  const { competition, dry, dumpEvents, eventsBackfill, fixtureId, url } = parseArgs(process.argv.slice(2));
  if (url) {
    if (competition || eventsBackfill) {
      console.warn('[match-facts] --url ignores --competition/--events-backfill (the link is the scope)');
    }
    await scrapeFromUrl(url, { fixtureId, dry, dumpEvents });
    return;
  }
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
  // One competition's failure (a discovery timeout on theanalyst's calendar,
  // a Supabase hiccup) must not abort the rest of the run — the cron used to
  // die at the first throw, so a broken UCL discovery silently starved every
  // competition after it in the loop. Process them all, then exit non-zero.
  const failed: string[] = [];
  for (const comp of comps) {
    try {
      await discoverForCompetition(comp, dry, fixtureId);
    } catch (e: any) {
      console.error(`[match-facts] ${comp.competitionSlug}: discovery failed — ${e?.message ?? e}`);
      failed.push(`${comp.competitionSlug} (discovery)`);
    }
    try {
      await scrapeForCompetition(comp, budget, { dry, dumpEvents, eventsBackfill, fixtureId });
    } catch (e: any) {
      console.error(`[match-facts] ${comp.competitionSlug}: scrape failed — ${e?.message ?? e}`);
      failed.push(`${comp.competitionSlug} (scrape)`);
    }
  }
  if (failed.length > 0) throw new Error(`match-facts: ${failed.length} phase(s) failed: ${failed.join(', ')}`);
}

run()
  .then(() => closeBrowser())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('fatal:', e);
    closeBrowser().finally(() => process.exit(1));
  });
