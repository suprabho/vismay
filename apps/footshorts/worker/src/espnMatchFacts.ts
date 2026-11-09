/**
 * ESPN fallback for match facts (private admin storage only).
 *
 * theanalyst.com, the Opta match-facts source (theanalystMatchFacts.ts), has
 * served its scraper a Cloudflare managed challenge since 2026-11-08. This
 * job fills the gap from ESPN's public soccer API instead, for finished league
 * fixtures that have NO opta_match_facts rows:
 *
 *   1. LOOKUP — each league's ESPN scoreboard for the months the fixtures
 *      fall in (ESPN takes `dates=YYYYMM`, not ranges), matched to our
 *      fixtures by team names + kickoff ±1 day with the same matcher
 *      theanalyst discovery uses (matchFixtures / teamKeyVariants).
 *   2. FETCH — ESPN's match summary for each hit, normalized by
 *      @footshorts/shared/espnMatch (team stats, key events, line-ups,
 *      commentary) and upserted into admin_espn_league_matches on fixture_id.
 *
 * PRIVATE BOUNDARY: like the ESPN cup import, nothing here writes to
 * fixtures, fixture_events, opta_match_facts, opta_match_stories or any
 * consumer table. The admin Match facts tab and the admin HTML-stories brief
 * are the only readers.
 *
 * The automatic run is gated by the admin switch (admin_espn_fallback_settings,
 * the toggle on the Match facts tab): off → no ESPN requests at all. A pasted
 * ESPN link (--url) is an explicit request and runs either way.
 *
 * Usage:
 *   pnpm espn-facts                                  # every league, last 30 days
 *   pnpm espn-facts -- --competition=primera-division
 *   pnpm espn-facts -- --competition=premier-league,primera-division --fixture-id=<uuid>,<uuid>
 *   pnpm espn-facts -- --url='https://www.espn.in/football/match/_/gameId/401882816/barcelona-atletico-madrid'
 *   pnpm espn-facts -- --url=… --fixture-id=<uuid>   # pin the fixture instead of matching by teams/date
 *   pnpm espn-facts -- --dry                         # look up + fetch + print, no writes
 */

import { createClient } from '@supabase/supabase-js';
import {
  ESPN_LEAGUES,
  ESPN_LEAGUE_MATCH_TABLE,
  espnLeagueByCode,
  espnLeagueBySlug,
  fetchEspnScoreboardMonth,
  parseEspnMatchUrl,
  readEspnFallbackSetting,
  saveEspnLeagueMatch,
  scoreboardMonths,
  summaryLeagueCode,
  toStoredEspnLeagueMatch,
  type EspnScoreboardMatch,
} from '@footshorts/shared/espnLeagues';
import { fetchEspnMatch, fetchEspnMatchSummary, normalizeEspnMatch, slimEspnSummary, type EspnCompetitionRef } from '@footshorts/shared/espnMatch';
import { matchFixtures, type DiscoveredMatch, type UnmappedFixture } from './theanalyst/matchDiscovery';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** Same trailing window as theanalystMatchFacts.ts. */
const LOOKBACK_DAYS = 30;
/** Match summaries fetched per automatic run; the 3-hourly cron drains the rest. */
const MAX_FETCHES_PER_RUN = 40;
/** A fixture-list run names at most this many (the HTML-stories picker cap). */
const MAX_FIXTURES_PER_RUN = 40;
/** Courtesy gap between ESPN requests. */
const REQUEST_GAP_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function splitList(v: string): string[] {
  return [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))];
}

function parseArgs(argv: string[]) {
  let competitions: string[] = [];
  let fixtureIds: string[] = [];
  let url: string | null = null;
  let dry = false;
  for (const a of argv) {
    if (a === '--') continue;
    if (a.startsWith('--competition=')) competitions = splitList(a.slice('--competition='.length));
    else if (a.startsWith('--fixture-id=')) fixtureIds = splitList(a.slice('--fixture-id='.length));
    else if (a.startsWith('--url=')) url = a.slice('--url='.length).trim() || null;
    else if (a === '--dry') dry = true;
    else console.warn(`[espn-facts] ignoring unknown arg: ${a}`);
  }
  return { competitions, fixtureIds, url, dry };
}

type FixtureRow = {
  id: string;
  competition_slug: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  kickoff_at: string;
};

const FIXTURE_COLUMNS = 'id, competition_slug, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at';

async function teamNames(fixtures: FixtureRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('entities').select('id, name').in('id', ids);
  if (error) throw new Error(`entities lookup failed: ${error.message}`);
  return new Map((data ?? []).map((e) => [e.id as string, e.name as string]));
}

function toUnmapped(fixtures: FixtureRow[], names: Map<string, string>): UnmappedFixture[] {
  const out: UnmappedFixture[] = [];
  for (const f of fixtures) {
    const home = (f.home_team_id && names.get(f.home_team_id)) || f.home_team_name;
    const away = (f.away_team_id && names.get(f.away_team_id)) || f.away_team_name;
    if (home && away) out.push({ id: f.id, homeTeamName: home, awayTeamName: away, kickoffAt: f.kickoff_at });
  }
  return out;
}

/** ESPN scoreboard rows in the shape discovery's matcher takes. The full ISO
 * kickoff goes in kickoffDate: matchFixtures compares it within ±1 day. */
function asCandidates(matches: EspnScoreboardMatch[]): DiscoveredMatch[] {
  return matches.map((m) => ({
    matchId: m.espn_event_id,
    competitionId: m.league_code,
    seasonId: '',
    homeTeamRaw: m.home_team_name,
    awayTeamRaw: m.away_team_name,
    kickoffDate: m.kickoff_at,
  }));
}

async function idsWith(table: string, fixtureIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < fixtureIds.length; i += 200) {
    const { data, error } = await supabase.from(table).select('fixture_id').in('fixture_id', fixtureIds.slice(i, i + 200));
    if (error) throw new Error(`${table} query failed: ${error.message}`);
    for (const r of data ?? []) out.add(r.fixture_id as string);
  }
  return out;
}

async function fetchAndStore(
  fixtureId: string,
  league: EspnCompetitionRef,
  eventId: string,
  dry: boolean
): Promise<'stored' | 'not-finished'> {
  const { detail, raw } = await fetchEspnMatch(league, eventId);
  const line = `${detail.home.name} ${detail.home.score ?? '?'}-${detail.away.score ?? '?'} ${detail.away.name}`;
  if (!detail.status.completed) {
    console.log(`[espn-facts] fixture ${fixtureId}: ESPN ${eventId} (${line}) is ${detail.status.description ?? 'not finished'} — skipped`);
    return 'not-finished';
  }
  const summary = `stats ${detail.facts ? 'yes' : 'no'}, ${detail.events.length} event(s), lineups ${detail.lineups ? 'yes' : 'no'}, ${detail.commentary.length} commentary line(s)`;
  if (dry) {
    console.log(`[espn-facts] (dry) fixture ${fixtureId} ← ESPN ${eventId}: ${line} · ${summary}`);
    return 'stored';
  }
  await saveEspnLeagueMatch(supabase, toStoredEspnLeagueMatch(fixtureId, league, detail, raw));
  console.log(`[espn-facts] fixture ${fixtureId} ← ESPN ${eventId}: ${line} · ${summary}`);
  return 'stored';
}

/** Automatic mode: every league (or the named ones), fixtures lacking Opta facts. */
async function runLookup(opts: { competitions: string[]; fixtureIds: string[]; dry: boolean }): Promise<string[]> {
  const { competitions, fixtureIds, dry } = opts;
  const leagues = ESPN_LEAGUES.filter((l) => competitions.length === 0 || competitions.includes(l.slug));
  if (leagues.length === 0) {
    console.log(`[espn-facts] no ESPN league mapped for '${competitions.join(', ')}' — see ESPN_LEAGUES in @footshorts/shared/espnLeagues`);
    return [];
  }
  const forced = fixtureIds.length > 0;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  let query = supabase
    .from('fixtures')
    .select(FIXTURE_COLUMNS)
    .in('competition_slug', leagues.map((l) => l.slug))
    .eq('status', 'finished');
  // A named fixture is attempted whatever its age; the cron keeps the window.
  query = forced ? query.in('id', fixtureIds) : query.gte('kickoff_at', since);
  const { data, error } = await query;
  if (error) throw new Error(`fixtures query failed: ${error.message}`);
  const fixtures = (data ?? []) as FixtureRow[];
  if (fixtures.length === 0) {
    console.log('[espn-facts] no finished fixtures to look up');
    return [];
  }

  // Fallback only: a fixture with Opta facts never gets an ESPN lookup. A
  // stored ESPN match is refreshed only when the run names the fixture.
  const ids = fixtures.map((f) => f.id);
  const [withOpta, withEspn] = await Promise.all([idsWith('opta_match_facts', ids), idsWith(ESPN_LEAGUE_MATCH_TABLE, ids)]);
  const todo = fixtures.filter((f) => !withOpta.has(f.id) && (forced || !withEspn.has(f.id)));
  console.log(
    `[espn-facts] ${fixtures.length} finished fixture(s): ${withOpta.size} have Opta facts, ${withEspn.size} have ESPN detail, ${todo.length} to look up`
  );
  if (todo.length === 0) return [];

  const names = await teamNames(todo);
  const failed: string[] = [];
  let budget = forced ? todo.length : MAX_FETCHES_PER_RUN;
  for (const league of leagues) {
    const leagueFixtures = todo.filter((f) => f.competition_slug === league.slug);
    if (leagueFixtures.length === 0) continue;
    if (budget <= 0) {
      console.log('[espn-facts] per-run fetch budget exhausted — remaining fixtures wait for the next run');
      break;
    }
    try {
      const months = scoreboardMonths(leagueFixtures.map((f) => f.kickoff_at));
      const matches: EspnScoreboardMatch[] = [];
      for (const month of months) {
        matches.push(...(await fetchEspnScoreboardMonth(league, month)));
        await sleep(REQUEST_GAP_MS);
      }
      const finished = matches.filter((m) => m.completed);
      const resolved = matchFixtures(asCandidates(finished), toUnmapped(leagueFixtures, names));
      const unmatched = leagueFixtures.filter((f) => !resolved.has(f.id));
      console.log(
        `[espn-facts] ${league.slug} (${league.code}): ${finished.length} finished ESPN match(es) in ${months.join(', ')}, matched ${resolved.size}/${leagueFixtures.length} fixture(s)`
      );
      for (const f of unmatched) {
        const home = (f.home_team_id && names.get(f.home_team_id)) || f.home_team_name;
        const away = (f.away_team_id && names.get(f.away_team_id)) || f.away_team_name;
        console.log(
          `[espn-facts]   no single ESPN match for ${home} v ${away} (${f.kickoff_at.slice(0, 10)}, fixture ${f.id}) — paste its ESPN link in the admin Match facts tab`
        );
      }
      for (const [fixtureId, hit] of resolved) {
        if (budget <= 0) break;
        budget--;
        try {
          await fetchAndStore(fixtureId, league, hit.matchId, dry);
        } catch (e) {
          console.error(`[espn-facts] fixture ${fixtureId}: ${e instanceof Error ? e.message : e}`);
          failed.push(`${league.slug} fixture ${fixtureId}`);
        }
        await sleep(REQUEST_GAP_MS);
      }
    } catch (e) {
      console.error(`[espn-facts] ${league.slug}: ${e instanceof Error ? e.message : e}`);
      failed.push(league.slug);
    }
  }
  return failed;
}

/** One pasted ESPN link. The fixture: pinned → already stored → teams + date. Never created. */
async function runUrl(rawUrl: string, opts: { fixtureId: string | null; dry: boolean }): Promise<void> {
  const eventId = parseEspnMatchUrl(rawUrl);
  if (!eventId) throw new Error(`--url is not an ESPN match link (needs …/gameId/<number>): ${rawUrl}`);

  // `all` answers for any competition; the summary then names the league.
  const summary = await fetchEspnMatchSummary({ slug: 'unknown', code: 'all' }, eventId);
  const code = summaryLeagueCode(summary);
  const known = espnLeagueByCode(code);
  const preview = normalizeEspnMatch(summary, {
    eventId,
    cup: { slug: known?.slug ?? 'unknown', code: code ?? 'all' },
    fetchedAt: new Date().toISOString(),
  });
  const kickoff = preview.kickoff_at;
  console.log(
    `[espn-facts] url mode: ESPN ${eventId} · ${preview.home.name} ${preview.home.score ?? '?'}-${preview.away.score ?? '?'} ${preview.away.name} · ${code ?? 'unknown league'} · ${kickoff ?? 'no kickoff'}`
  );

  let fixture: FixtureRow | null = null;
  if (opts.fixtureId) {
    const { data, error } = await supabase.from('fixtures').select(FIXTURE_COLUMNS).eq('id', opts.fixtureId).maybeSingle();
    if (error) throw new Error(`fixtures lookup failed: ${error.message}`);
    fixture = (data as FixtureRow | null) ?? null;
    if (!fixture) throw new Error(`fixture ${opts.fixtureId} not found`);
  } else {
    const { data: linked, error: linkedError } = await supabase
      .from(ESPN_LEAGUE_MATCH_TABLE)
      .select('fixture_id')
      .eq('espn_event_id', eventId)
      .maybeSingle();
    if (linkedError) throw new Error(`${ESPN_LEAGUE_MATCH_TABLE} lookup failed: ${linkedError.message}`);
    if (linked) {
      const { data } = await supabase.from('fixtures').select(FIXTURE_COLUMNS).eq('id', linked.fixture_id).maybeSingle();
      fixture = (data as FixtureRow | null) ?? null;
      if (fixture) console.log(`[espn-facts] fixture ${fixture.id} already holds this ESPN match — refreshing`);
    }
    if (!fixture && kickoff) {
      const day = Date.parse(kickoff);
      const { data, error } = await supabase
        .from('fixtures')
        .select(FIXTURE_COLUMNS)
        .gte('kickoff_at', new Date(day - 2 * 86_400_000).toISOString())
        .lt('kickoff_at', new Date(day + 2 * 86_400_000).toISOString());
      if (error) throw new Error(`fixtures query failed: ${error.message}`);
      const rows = (data ?? []) as FixtureRow[];
      const resolved = matchFixtures(
        asCandidates([
          {
            espn_event_id: eventId,
            league_code: code ?? 'all',
            kickoff_at: kickoff,
            home_team_name: preview.home.name,
            away_team_name: preview.away.name,
            completed: preview.status.completed,
          },
        ]),
        toUnmapped(rows, await teamNames(rows))
      );
      const hits = [...resolved.keys()];
      if (hits.length > 1) {
        throw new Error(`${preview.home.name} v ${preview.away.name} matches ${hits.length} fixtures (${hits.join(', ')}) — re-run with fixture_id=<uuid>`);
      }
      fixture = rows.find((r) => r.id === hits[0]) ?? null;
      if (fixture) console.log(`[espn-facts] matched fixture ${fixture.id} (${fixture.competition_slug}) by team names + date`);
    }
  }
  if (!fixture) {
    // The private boundary rules out creating a fixtures row from ESPN.
    throw new Error(
      `no fixtures row matches ${preview.home.name} v ${preview.away.name}${kickoff ? ` on ${kickoff.slice(0, 10)}` : ''} — pick the fixture in the admin Match facts tab (or dispatch with fixture_id=<uuid>)`
    );
  }

  // Stored under OUR competition slug; the ESPN code is what refreshes ask for.
  const ref: EspnCompetitionRef = {
    slug: fixture.competition_slug ?? known?.slug ?? 'unknown',
    code: code ?? espnLeagueBySlug(fixture.competition_slug)?.code ?? 'all',
  };
  const detail = normalizeEspnMatch(summary, { eventId, cup: ref, fetchedAt: new Date().toISOString() });
  if (!detail.status.completed) console.warn(`[espn-facts] ESPN reports ${detail.status.description ?? 'the match not finished'} — storing what it has`);
  if (opts.dry) {
    console.log(`[espn-facts] (dry) fixture ${fixture.id}:`, JSON.stringify({ facts: detail.facts, events: detail.events.length, commentary: detail.commentary.length }));
    return;
  }
  await saveEspnLeagueMatch(supabase, toStoredEspnLeagueMatch(fixture.id, ref, detail, slimEspnSummary(summary)));
  console.log(
    `[espn-facts] fixture ${fixture.id}: ESPN detail stored (stats ${detail.facts ? 'yes' : 'no'}, ${detail.events.length} event(s), ${detail.commentary.length} commentary line(s))`
  );
}

async function main() {
  const { competitions, fixtureIds, url, dry } = parseArgs(process.argv.slice(2));
  if (url) {
    if (fixtureIds.length > 1) throw new Error('--url pins at most one --fixture-id');
    await runUrl(url, { fixtureId: fixtureIds[0] ?? null, dry });
    return;
  }
  if (fixtureIds.length > MAX_FIXTURES_PER_RUN) {
    throw new Error(`--fixture-id takes at most ${MAX_FIXTURES_PER_RUN} fixtures per run (got ${fixtureIds.length})`);
  }
  const setting = await readEspnFallbackSetting(supabase);
  if (!setting.available) {
    console.log(
      `[espn-facts] ESPN fallback unavailable — apply the admin_espn_league_matches migration first (${setting.error ?? 'settings table missing'})`
    );
    return;
  }
  if (!setting.enabled) {
    console.log('[espn-facts] ESPN fallback is switched off (admin Match facts tab) — no ESPN requests made');
    return;
  }
  const failed = await runLookup({ competitions, fixtureIds, dry });
  if (failed.length > 0) throw new Error(`espn-facts: ${failed.length} failure(s): ${failed.join(', ')}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('fatal:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
