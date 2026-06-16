/**
 * One-time seed of API-Football ids onto our entities (leagues + teams).
 *
 * football-data.org and API-Football use disjoint ids, so before the events
 * worker can fetch goal scorers we need a bridge. We anchor on each league
 * (API-Football's league ids are small, stable constants), then pull that
 * league's squad list for the season and match teams back to our entities by
 * normalized name. Both writes go to entities.api_football_id (added in the
 * 20260616 migration).
 *
 * Idempotent: re-running just rewrites the same ids. Leagues we don't have an
 * API-Football id for (and teams we can't name-match) are logged, not guessed —
 * fix those by extending AF_LEAGUE_BY_FD_ID or by hand.
 *
 * Usage:
 *   npm run seed:af-ids                 # current season (start year)
 *   npm run seed:af-ids -- --season=2025
 *   npm run seed:af-ids -- --dry        # match + report, don't write
 */

import { createClient } from '@supabase/supabase-js';

// API-Football is sold via two channels with different hosts/headers and
// non-interchangeable keys. Default to the direct API-Sports host; set
// API_FOOTBALL_HOST=rapidapi to use a key issued through RapidAPI instead.
const AF_TOKEN = process.env.API_FOOTBALL_TOKEN!;
const AF_VIA_RAPIDAPI = (process.env.API_FOOTBALL_HOST ?? 'direct').toLowerCase() === 'rapidapi';
const AF_BASE = AF_VIA_RAPIDAPI
  ? 'https://api-football-v1.p.rapidapi.com/v3'
  : 'https://v3.football.api-sports.io';
const AF_HEADERS: Record<string, string> = AF_VIA_RAPIDAPI
  ? { 'x-rapidapi-key': AF_TOKEN, 'x-rapidapi-host': 'api-football-v1.p.rapidapi.com' }
  : { 'x-apisports-key': AF_TOKEN };
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// Our league entities carry football-data.org's numeric competition id
// (entities.football_data_id, set by seed.ts). Map those to API-Football's
// league ids. FD ids on the left are football-data.org v4 constants; AF ids on
// the right are API-Football league ids. EL/others not listed here are reported
// at runtime so they can be added rather than silently skipped.
const AF_LEAGUE_BY_FD_ID: Record<number, number> = {
  2021: 39,  // Premier League
  2014: 140, // La Liga (Primera Division)
  2019: 135, // Serie A
  2002: 78,  // Bundesliga
  2015: 61,  // Ligue 1
  2003: 88,  // Eredivisie
  2017: 94,  // Primeira Liga
  2016: 40,  // Championship
  2013: 71,  // Brazil Série A
  2001: 2,   // Champions League
  2000: 1,   // World Cup
  2018: 4,   // European Championship
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mirrors seed.ts so AF team names slugify to the same identity our entities
// were seeded under. Kept inline (as in seed.ts) rather than shared, since the
// seed scripts are standalone one-shots.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function commonName(name: string): string {
  return name
    .replace(/\b(UEFA|FIFA|CONMEBOL|CONCACAF|AFC Champions)\b/gi, '')
    .replace(/\b(FC|CF|CD|SSC|SS|AFC|AC|AS|RC|RCD|CA|SL|SC|BK|IF|FK|NK|HSV|TSV|VFL|VFB|RB)\b/gi, '')
    .replace(/^\s*\d+\.\s*(FC|FSV|FCN)?\s*/i, '')
    .replace(/\b(18|19|20)\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type AfResponse<T> = { response: T[]; errors?: unknown };

async function afFetch<T>(path: string): Promise<T[]> {
  const res = await fetch(`${AF_BASE}${path}`, { headers: AF_HEADERS });
  if (!res.ok) {
    throw new Error(`api-football ${path} failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as AfResponse<T>;
  // API-Football returns 200 with a populated `errors` object on quota/plan
  // problems — surface those rather than treating an empty response as "no data".
  if (body.errors && !Array.isArray(body.errors) && Object.keys(body.errors).length > 0) {
    throw new Error(`api-football ${path} errors: ${JSON.stringify(body.errors)}`);
  }
  return body.response ?? [];
}

type LeagueEntity = { id: string; slug: string; name: string; football_data_id: number | null };

async function loadLeagues(): Promise<LeagueEntity[]> {
  const { data, error } = await supabase
    .from('entities')
    .select('id, slug, name, football_data_id')
    .eq('type', 'league');
  if (error) throw error;
  return (data ?? []) as LeagueEntity[];
}

async function loadTeamIdBySlug(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('entities')
    .select('id, slug')
    .eq('type', 'team');
  if (error) throw error;
  const map = new Map<string, string>();
  for (const t of data ?? []) map.set((t as any).slug as string, (t as any).id as string);
  return map;
}

type AfTeamWrap = { team: { id: number; name: string } };

async function main() {
  if (!AF_TOKEN) throw new Error('API_FOOTBALL_TOKEN required');

  const seasonArg = process.argv.find((a) => a.startsWith('--season='));
  const dry = process.argv.includes('--dry');
  // AF seasons are keyed by the season's *start* year. Default to the current
  // season: Jan–Jun belong to the prior year's season (e.g. Jun 2026 → 2025).
  const now = new Date();
  const defaultSeason = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const season = seasonArg ? Number(seasonArg.slice('--season='.length)) : defaultSeason;

  console.log(`[seed:af-ids] season=${season}${dry ? ' (dry)' : ''}`);

  const leagues = await loadLeagues();
  const teamIdBySlug = await loadTeamIdBySlug();
  console.log(`[seed:af-ids] ${leagues.length} leagues, ${teamIdBySlug.size} teams in entities`);

  const leagueUpdates: { id: string; api_football_id: number }[] = [];
  const teamUpdates = new Map<string, number>(); // entity id -> af id (dedupe across leagues)
  const unmatchedTeams: string[] = [];

  for (const league of leagues) {
    const afLeagueId = league.football_data_id != null ? AF_LEAGUE_BY_FD_ID[league.football_data_id] : undefined;
    if (afLeagueId == null) {
      console.log(`  [${league.slug}] no API-Football league id (fd_id=${league.football_data_id}) — skipped`);
      continue;
    }
    leagueUpdates.push({ id: league.id, api_football_id: afLeagueId });

    await sleep(1500); // well under the free-tier rate; ~13 calls total
    let teams: AfTeamWrap[];
    try {
      teams = await afFetch<AfTeamWrap>(`/teams?league=${afLeagueId}&season=${season}`);
    } catch (e) {
      console.error(`  [${league.slug}] teams fetch failed: ${(e as Error).message}`);
      continue;
    }

    let matched = 0;
    for (const { team } of teams) {
      const slug = slugify(commonName(team.name));
      const entityId = teamIdBySlug.get(slug);
      if (!entityId) {
        unmatchedTeams.push(`${league.slug}:${team.name} (${slug})`);
        continue;
      }
      teamUpdates.set(entityId, team.id);
      matched++;
    }
    console.log(`  [${league.slug}] af=${afLeagueId}: ${matched}/${teams.length} teams matched`);
  }

  console.log(
    `[seed:af-ids] resolved ${leagueUpdates.length} leagues, ${teamUpdates.size} teams; ${unmatchedTeams.length} AF teams unmatched`,
  );
  if (unmatchedTeams.length) {
    console.log('[seed:af-ids] unmatched (extend entities or fix slug):');
    for (const u of unmatchedTeams) console.log(`    - ${u}`);
  }

  if (dry) {
    console.log('[seed:af-ids] dry run — no writes.');
    return;
  }

  // Write league ids, then team ids. We update one row at a time (upsert would
  // need every NOT-NULL column); the volume is tiny (~13 + ~300).
  for (const u of leagueUpdates) {
    const { error } = await supabase.from('entities').update({ api_football_id: u.api_football_id }).eq('id', u.id);
    if (error) throw error;
  }
  for (const [id, afId] of teamUpdates) {
    const { error } = await supabase.from('entities').update({ api_football_id: afId }).eq('id', id);
    if (error) throw error;
  }

  console.log('[seed:af-ids] done.');
}

main().catch((e) => {
  console.error('[seed:af-ids] fatal:', e);
  process.exit(1);
});
