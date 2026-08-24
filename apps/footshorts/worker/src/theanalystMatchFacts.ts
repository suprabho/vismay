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
 *      idempotent.
 *
 * Deterministic parsing throughout — no Gemini. Runs every 3h, 30min after
 * the scores refresh flips fixtures to 'finished'
 * (.github/workflows/footshorts-theanalyst-match-facts.yml).
 *
 * Usage:
 *   npm run match-facts                # all tracked competitions
 *   npm run match-facts -- --competition=premier-league
 *   npm run match-facts -- --dry       # discover + scrape, print, no writes
 */

import { createClient } from '@supabase/supabase-js';
import { THEANALYST_COMPETITIONS, TheanalystCompetition } from './theanalyst/competitions';
import { discoverMatchesForCompetition, matchFixtures, UnmappedFixture } from './theanalyst/matchDiscovery';
import { fetchMatchFacts } from './theanalyst/matchCentre';
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

function parseArgs(argv: string[]): { competition: string | null; dry: boolean } {
  let competition: string | null = null;
  let dry = false;
  for (const a of argv) {
    if (a.startsWith('--competition=')) competition = a.slice('--competition='.length) || null;
    else if (a === '--dry') dry = true;
    else console.warn(`[match-facts] ignoring unknown arg: ${a}`);
  }
  return { competition, dry };
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

async function discoverForCompetition(comp: TheanalystCompetition, dry: boolean): Promise<number> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, theanalyst_match_id')
    .eq('competition_slug', comp.competitionSlug)
    .is('theanalyst_match_id', null)
    .in('status', ['finished', 'live'])
    .gte('kickoff_at', since);
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

  for (const [fixtureId, m] of resolved) {
    const { error: updateError } = await supabase
      .from('fixtures')
      .update({
        theanalyst_match_id: m.matchId,
        theanalyst_competition_id: m.competitionId,
        theanalyst_season_id: m.seasonId,
        theanalyst_match_url: m.url,
      })
      .eq('id', fixtureId);
    if (updateError) {
      console.error(`[match-facts] mapping persist failed for fixture ${fixtureId}: ${updateError.message}`);
    }
  }
  return resolved.size;
}

async function scrapeForCompetition(
  comp: TheanalystCompetition,
  budget: { remaining: number },
  dry: boolean
): Promise<number> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, theanalyst_match_id, theanalyst_competition_id, theanalyst_season_id')
    .eq('competition_slug', comp.competitionSlug)
    .not('theanalyst_match_id', 'is', null)
    .eq('status', 'finished')
    .gte('kickoff_at', since);
  if (error) throw new Error(`fixtures query failed: ${error.message}`);

  const mapped = (data ?? []) as Array<{
    id: string;
    theanalyst_match_id: string;
    theanalyst_competition_id: string | null;
    theanalyst_season_id: string | null;
  }>;
  if (mapped.length === 0) return 0;

  const { data: existing, error: existingError } = await supabase
    .from('opta_match_facts')
    .select('fixture_id')
    .in('fixture_id', mapped.map((f) => f.id));
  if (existingError) throw new Error(`opta_match_facts query failed: ${existingError.message}`);
  const done = new Set((existing ?? []).map((r) => r.fixture_id));

  let scraped = 0;
  for (const fixture of mapped) {
    if (done.has(fixture.id)) continue;
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
        fixture.theanalyst_match_id
      );
    } catch (e: any) {
      console.error(`[match-facts] scrape failed for fixture ${fixture.id}: ${e.message ?? e}`);
      continue;
    }

    if (dry) {
      console.log(`[match-facts] (dry) fixture ${fixture.id}:`, JSON.stringify(facts));
      scraped++;
      continue;
    }

    const now = new Date().toISOString();
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
  }

  console.log(`[match-facts] ${comp.competitionSlug}: scraped ${scraped} match(es)`);
  return scraped;
}

async function run() {
  const { competition, dry } = parseArgs(process.argv.slice(2));
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
    await discoverForCompetition(comp, dry);
    await scrapeForCompetition(comp, budget, dry);
  }
}

run()
  .then(() => closeBrowser())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('fatal:', e);
    closeBrowser().finally(() => process.exit(1));
  });
