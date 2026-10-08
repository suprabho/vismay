/**
 * Seeds the canonical entity set the news tagger resolves against:
 * viznba_teams, viznba_players and viznba_coaches, from ESPN's public API.
 *
 *   1. Upsert the 30 teams (+ TEAM_ALIASES)
 *   2. For each team, upsert its current roster and head coach
 *      (+ PLAYER_ALIASES), pointing team_id at the team they're on today
 *   3. Players / coaches no longer on any roster are flagged active=false —
 *      never deleted, so tags on older articles keep resolving
 *   4. Notable former players / coaches (formerEntities.ts) not on a roster
 *      today are looked up on ESPN and upserted as active=false
 *
 * Step 3 only runs when every roster fetched: a partial run must not mark a
 * whole team's players inactive because ESPN timed out on that team.
 *
 * Re-run weekly (trades, signings, waivers) and on deadline / draft days.
 * The `aliases` columns are owned by aliases.ts — edits made in the DB are
 * overwritten by the next seed.
 *
 * Run via: `pnpm --filter @viznba/worker seed:roster`
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabase'
import { findAthlete, fetchRoster, fetchTeams, type EspnAthlete, type EspnCoach } from './espn'
import { PLAYER_ALIASES, TEAM_ALIASES } from './aliases'
import { FORMER_COACHES, FORMER_PLAYERS } from './formerEntities'
import { norm } from './entityResolver'

const UPSERT_CHUNK = 500

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function upsert(sb: SupabaseClient, table: string, rows: object[], onConflict: string) {
  for (const part of chunk(rows, UPSERT_CHUNK)) {
    const { error } = await sb.from(table).upsert(part, { onConflict })
    if (error) throw new Error(`upsert ${table}: ${error.message}`)
  }
}

/** Flags every active row whose id wasn't seen this run as inactive. */
async function deactivateMissing(
  sb: SupabaseClient,
  table: string,
  idColumn: string,
  seen: Set<string>,
): Promise<number> {
  const { data, error } = await sb.from(table).select(idColumn).eq('active', true).range(0, 9999)
  if (error) throw new Error(`read ${table}: ${error.message}`)
  const stale = ((data ?? []) as unknown as Array<Record<string, string>>)
    .map((r) => r[idColumn])
    .filter((id) => !seen.has(id))
  for (const ids of chunk(stale, UPSERT_CHUNK)) {
    const { error: updErr } = await sb
      .from(table)
      .update({ active: false, team_id: null, updated_at: new Date().toISOString() })
      .in(idColumn, ids)
    if (updErr) throw new Error(`deactivate ${table}: ${updErr.message}`)
  }
  return stale.length
}

const playerAliases = new Map(Object.entries(PLAYER_ALIASES).map(([name, a]) => [norm(name), a]))

function playerRow(a: EspnAthlete, teamId: string | null, now: string, active = true) {
  return {
    player_id: a.id,
    first_name: a.firstName,
    last_name: a.lastName,
    display_name: a.displayName,
    team_id: teamId,
    jersey: a.jersey ?? null,
    position: a.position?.abbreviation ?? null,
    headshot_url: a.headshot?.href ?? null,
    date_of_birth: a.dateOfBirth ? a.dateOfBirth.slice(0, 10) : null,
    aliases: playerAliases.get(norm(a.displayName)) ?? [],
    active,
    updated_at: now,
  }
}

function coachRow(c: EspnCoach, teamId: string | null, now: string, active = true) {
  return {
    coach_id: c.id,
    first_name: c.firstName,
    last_name: c.lastName,
    display_name: `${c.firstName} ${c.lastName}`,
    team_id: teamId,
    aliases: [],
    active,
    updated_at: now,
  }
}

/**
 * Step 4. Former coaches are ESPN *athlete* ids, a different number space from
 * roster coach ids, hence the `athlete-` prefix. Lookup misses only warn: a
 * renamed or missing legend must not fail the weekly roster refresh.
 */
async function seedFormer(
  sb: SupabaseClient,
  rosterPlayerNames: Set<string>,
  rosterCoachNames: Set<string>,
  now: string,
) {
  const lookup = async (name: string) => {
    try {
      const a = await findAthlete(name)
      if (!a) console.warn(`[seed:roster] former entity not found on ESPN: ${JSON.stringify(name)}`)
      return a
    } catch (e) {
      console.warn(`[seed:roster] former entity lookup failed for ${JSON.stringify(name)}:`, e instanceof Error ? e.message : e)
      return null
    }
  }

  const players: ReturnType<typeof playerRow>[] = []
  for (const name of FORMER_PLAYERS) {
    if (rosterPlayerNames.has(norm(name))) continue
    const a = await lookup(name)
    if (a) players.push(playerRow(a, null, now, false))
  }

  const coaches: ReturnType<typeof coachRow>[] = []
  for (const name of FORMER_COACHES) {
    if (rosterCoachNames.has(norm(name))) continue
    const a = await lookup(name)
    if (a) coaches.push(coachRow({ ...a, id: `athlete-${a.id}` }, null, now, false))
  }

  await upsert(sb, 'viznba_players', players, 'player_id')
  await upsert(sb, 'viznba_coaches', coaches, 'coach_id')
  console.log(`[seed:roster] former players=${players.length} coaches=${coaches.length}`)
}

export async function seedRoster() {
  const sb = getSupabase()
  const now = new Date().toISOString()

  const teams = await fetchTeams()
  if (teams.length !== 30) throw new Error(`ESPN returned ${teams.length} teams, expected 30`)

  await upsert(
    sb,
    'viznba_teams',
    teams.map((t) => {
      const teamId = t.abbreviation.toLowerCase()
      return {
        team_id: teamId,
        espn_id: t.id,
        abbreviation: t.abbreviation,
        location: t.location,
        name: t.name,
        display_name: t.displayName,
        primary_color: t.color ?? null,
        secondary_color: t.alternateColor ?? null,
        logo_url: t.logos?.find((l) => l.rel?.includes('default'))?.href ?? t.logos?.[0]?.href ?? null,
        aliases: TEAM_ALIASES[teamId] ?? [],
        updated_at: now,
      }
    }),
    'team_id',
  )
  console.log(`[seed:roster] teams=${teams.length}`)

  const players = new Map<string, ReturnType<typeof playerRow>>()
  const coaches = new Map<string, ReturnType<typeof coachRow>>()
  const failed: string[] = []

  for (const t of teams) {
    const teamId = t.abbreviation.toLowerCase()
    try {
      const roster = await fetchRoster(t.id)
      for (const a of roster.athletes) players.set(a.id, playerRow(a, teamId, now))
      for (const c of roster.coaches) coaches.set(c.id, coachRow(c, teamId, now))
    } catch (e) {
      failed.push(teamId)
      console.error(`[seed:roster] ${teamId} roster failed:`, e instanceof Error ? e.message : e)
    }
  }

  await upsert(sb, 'viznba_players', [...players.values()], 'player_id')
  await upsert(sb, 'viznba_coaches', [...coaches.values()], 'coach_id')
  console.log(`[seed:roster] players=${players.size} coaches=${coaches.size}`)

  const seenNames = new Set([...players.values()].map((p) => norm(p.display_name)))
  for (const name of Object.keys(PLAYER_ALIASES)) {
    if (!seenNames.has(norm(name))) {
      console.warn(`[seed:roster] PLAYER_ALIASES key not on any roster: ${JSON.stringify(name)}`)
    }
  }

  if (failed.length > 0) {
    throw new Error(
      `[seed:roster] ${failed.length} roster(s) failed (${failed.join(', ')}); skipped deactivation`,
    )
  }
  const goneP = await deactivateMissing(sb, 'viznba_players', 'player_id', new Set(players.keys()))
  const goneC = await deactivateMissing(sb, 'viznba_coaches', 'coach_id', new Set(coaches.keys()))
  console.log(`[seed:roster] deactivated players=${goneP} coaches=${goneC}`)

  await seedFormer(
    sb,
    new Set([...players.values()].map((p) => norm(p.display_name))),
    new Set([...coaches.values()].map((c) => norm(c.display_name))),
    now,
  )
}

if (require.main === module) {
  seedRoster()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('fatal:', e)
      process.exit(1)
    })
}
