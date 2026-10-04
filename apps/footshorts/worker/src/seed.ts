/**
 * Seed canonical entities from football-data.org.
 *
 * Run once to populate the entities table with leagues, teams, and (phase 2) players.
 * Uses the free tier (12 competitions) for MVP — migrate to api-football later
 * for broader coverage.
 *
 * Usage: npm run seed
 */

import { createClient } from '@supabase/supabase-js';
import { fdFetch, sleep, FD_TOKEN } from './footballData';
import { entitySlug } from './teamSlug';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function seedLeagues() {
  console.log('[seed] leagues...');
  const data = await fdFetch<{ competitions: any[] }>('/competitions');

  // Free tier: 12 competitions. Filter to leagues/cups we want to surface.
  const wanted = new Set([
    'PL',   // Premier League
    'PD',   // La Liga
    'BL1',  // Bundesliga
    'SA',   // Serie A
    'FL1',  // Ligue 1
    'CL',   // Champions League
    'EL',   // Europa League
    'WC',   // World Cup
    'EC',   // Euros
    'DED',  // Eredivisie
    'PPL',  // Primeira Liga
    'BSA',  // Brazil Série A
    'ELC',  // Championship
  ]);

  const rows = data.competitions
    .filter((c) => wanted.has(c.code))
    .map((c) => ({
      type: 'league' as const,
      slug: entitySlug(c.name),
      name: c.name,
      football_data_id: c.id,
      country: c.area?.name ?? null,
      crest_url: c.emblem ?? null,
    }));

  const { error } = await supabase
    .from('entities')
    .upsert(rows, { onConflict: 'type,slug' });

  if (error) throw error;
  console.log(`[seed] upserted ${rows.length} leagues`);
  return data.competitions.filter((c) => wanted.has(c.code));
}

// Continental club comps (CL, EL) and international national-team comps (WC,
// EC) are not domestic leagues — a team's `league_slug` should always point at
// its domestic league. Memberships in these comps still go into
// team_competitions; they just don't set league_slug.
const NON_DOMESTIC_LEAGUE_CODES = new Set(['CL', 'EL', 'WC', 'EC']);

async function seedTeams(competitions: any[]) {
  console.log('[seed] teams...');
  const allTeams: any[] = [];
  const memberships: { teamSlug: string; competitionSlug: string }[] = [];

  for (const comp of competitions) {
    await sleep(6500); // rate limit
    try {
      const data = await fdFetch<{ teams: any[] }>(`/competitions/${comp.code}/teams`);
      const leagueSlug = entitySlug(comp.name);
      const isDomesticLeague = !NON_DOMESTIC_LEAGUE_CODES.has(comp.code);
      for (const t of data.teams) {
        const teamSlug = entitySlug(t.name);
        allTeams.push({
          type: 'team' as const,
          slug: teamSlug,
          name: t.name,
          football_data_id: t.id,
          country: t.area?.name ?? null,
          league_slug: isDomesticLeague ? leagueSlug : null,
          crest_url: t.crest ?? null,
        });
        memberships.push({ teamSlug, competitionSlug: leagueSlug });
      }
      console.log(`  [${comp.code}] +${data.teams.length} teams`);
    } catch (e) {
      console.error(`  [${comp.code}] failed:`, e);
    }
  }

  // Dedupe entity rows by slug, preferring a row whose league_slug is set —
  // i.e. one from a domestic-league pass. A team seen first via CL and later
  // via PL must keep the PL slug, not get clobbered by the CL null.
  const teamMap = new Map<string, any>();
  for (const t of allTeams) {
    const existing = teamMap.get(t.slug);
    if (!existing || (!existing.league_slug && t.league_slug)) {
      teamMap.set(t.slug, t);
    }
  }
  const deduped = Array.from(teamMap.values());

  const { error } = await supabase
    .from('entities')
    .upsert(deduped, { onConflict: 'type,slug' });

  if (error) throw error;
  console.log(`[seed] upserted ${deduped.length} unique teams`);

  // Resolve slugs -> ids for the team_competitions junction.
  const slugSet = new Set<string>();
  for (const m of memberships) {
    slugSet.add(m.teamSlug);
    slugSet.add(m.competitionSlug);
  }
  const { data: lookup, error: lookupError } = await supabase
    .from('entities')
    .select('id, slug, type')
    .in('slug', Array.from(slugSet));
  if (lookupError) throw lookupError;

  const teamIdBySlug = new Map<string, string>();
  const compIdBySlug = new Map<string, string>();
  for (const e of lookup ?? []) {
    if (e.type === 'team') teamIdBySlug.set(e.slug, e.id);
    else if (e.type === 'league') compIdBySlug.set(e.slug, e.id);
  }

  const tcRows: { team_id: string; competition_id: string }[] = [];
  const seen = new Set<string>();
  for (const m of memberships) {
    const teamId = teamIdBySlug.get(m.teamSlug);
    const compId = compIdBySlug.get(m.competitionSlug);
    if (!teamId || !compId) continue;
    const key = `${teamId}:${compId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tcRows.push({ team_id: teamId, competition_id: compId });
  }

  const { error: tcError } = await supabase
    .from('team_competitions')
    .upsert(tcRows, { onConflict: 'team_id,competition_id', ignoreDuplicates: true });
  if (tcError) throw tcError;
  console.log(`[seed] upserted ${tcRows.length} team-competition memberships`);
}

async function main() {
  if (!FD_TOKEN) throw new Error('FOOTBALL_DATA_TOKEN required');
  const comps = await seedLeagues();
  await seedTeams(comps);
  console.log('[seed] done. Players left as phase 2 (needs paid tier for squad data).');
}

main().catch((e) => {
  console.error('[seed] fatal:', e);
  process.exit(1);
});
