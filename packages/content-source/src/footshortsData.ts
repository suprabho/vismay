/**
 * Read real football standings + fixtures from Supabase for the admin's
 * "add football data" picker, with a live football-data.org fallback.
 *
 * SERVER-ONLY — uses the service-role Supabase client and the football-data.org
 * token. Import from API routes / server components, never the browser. The
 * pure block builders that consume these rows live in `footshortsBlocks` (which
 * IS browser-safe).
 *
 * Read strategy (the user picked "DB-first, API fallback"):
 *   1. Query the `standings` / `fixtures` tables the worker populates.
 *   2. On a miss for a (competition, season), pull that one competition from
 *      football-data.org, upsert it, and re-read. Guarded so a missing
 *      FOOTBALL_DATA_TOKEN degrades to "no data" rather than throwing.
 *
 * The normalize helpers + single-competition sync mirror
 * `apps/footshorts/worker/src/fixtures.ts` (the canonical ingest). They're
 * duplicated here — three tiny pure functions plus a per-competition variant of
 * the worker's sync — rather than make the CI worker depend on this Next-side
 * package for them.
 */

import { createServiceClient } from './supabase'
import type {
  StandingRowInput,
  FixtureRowInput,
  TeamRef,
  CompetitionPhase,
} from './footshortsBlocks'

type Supabase = ReturnType<typeof createServiceClient>

const FD_BASE = 'https://api.football-data.org/v4'

export interface CompetitionOption {
  /** competition_slug, e.g. `champions-league`. */
  slug: string
  /** Display name from the league entity, e.g. `UEFA Champions League`. */
  name: string
  season: string
  hasStandings: boolean
  hasFixtures: boolean
}

export interface FixtureQuery {
  competitionSlug: string
  season: string
  phase?: CompetitionPhase
  /** Knockout stage code filter, e.g. `QUARTER_FINALS`. */
  stage?: string
}

// ── entity hydration ─────────────────────────────────────────────────────────

interface EntityRow {
  id: string
  slug: string
  name: string
  crest_url: string | null
  primary_color: string | null
}

/** Fetch the entity rows for a set of team uuids, keyed by id. */
async function loadTeamEntities(
  supabase: Supabase,
  teamIds: string[],
): Promise<Map<string, EntityRow>> {
  const ids = Array.from(new Set(teamIds.filter(Boolean)))
  const map = new Map<string, EntityRow>()
  if (ids.length === 0) return map
  const { data, error } = await supabase
    .from('entities')
    .select('id, slug, name, crest_url, primary_color')
    .in('id', ids)
  if (error || !data) return map
  for (const row of data as EntityRow[]) map.set(row.id, row)
  return map
}

/** Build a team ref using the entity SLUG as the id (the config convention). */
function teamRefFromEntity(e: EntityRow | undefined, withColor: boolean): TeamRef | null {
  if (!e) return null
  const ref: TeamRef = { id: e.slug, slug: e.slug, name: e.name, crest_url: e.crest_url }
  if (withColor) ref.primary_color = e.primary_color
  return ref
}

// ── DB reads ─────────────────────────────────────────────────────────────────

interface StandingDbRow {
  competition_slug: string
  season: string
  team_id: string
  position: number
  played: number
  won: number
  draw: number
  lost: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  form: string | null
  phase: CompetitionPhase | null
  group_label: string | null
}

async function readStandingsFromDb(
  supabase: Supabase,
  competitionSlug: string,
  season: string,
): Promise<StandingRowInput[]> {
  const { data, error } = await supabase
    .from('standings')
    .select(
      'competition_slug, season, team_id, position, played, won, draw, lost, goals_for, goals_against, goal_difference, points, form, phase, group_label',
    )
    .eq('competition_slug', competitionSlug)
    .eq('season', season)
    .order('group_label', { ascending: true })
    .order('position', { ascending: true })
  if (error || !data) return []
  const rows = data as StandingDbRow[]
  const teams = await loadTeamEntities(supabase, rows.map((r) => r.team_id))
  return rows.map((r) => {
    const team = teamRefFromEntity(teams.get(r.team_id), false)
    return {
      competition_slug: r.competition_slug,
      season: r.season,
      team_id: team?.slug ?? r.team_id,
      position: r.position,
      played: r.played,
      won: r.won,
      draw: r.draw,
      lost: r.lost,
      goals_for: r.goals_for,
      goals_against: r.goals_against,
      goal_difference: r.goal_difference,
      points: r.points,
      form: r.form,
      team,
      ...(r.phase ? { phase: r.phase } : {}),
      ...(r.group_label ? { group_label: r.group_label } : {}),
    }
  })
}

interface FixtureDbRow {
  id: string
  competition_slug: string
  season: string
  matchday: number | null
  stage: string | null
  phase: CompetitionPhase | null
  kickoff_at: string
  status: FixtureRowInput['status']
  home_score: number | null
  away_score: number | null
  home_team_id: string | null
  away_team_id: string | null
  home_team_name: string | null
  away_team_name: string | null
}

async function readFixturesFromDb(
  supabase: Supabase,
  q: FixtureQuery,
): Promise<FixtureRowInput[]> {
  let query = supabase
    .from('fixtures')
    .select(
      'id, competition_slug, season, matchday, stage, phase, kickoff_at, status, home_score, away_score, home_team_id, away_team_id, home_team_name, away_team_name',
    )
    .eq('competition_slug', q.competitionSlug)
    .eq('season', q.season)
  if (q.phase) query = query.eq('phase', q.phase)
  if (q.stage) query = query.eq('stage', q.stage)
  const { data, error } = await query.order('kickoff_at', { ascending: true })
  if (error || !data) return []
  const rows = data as FixtureDbRow[]
  const teams = await loadTeamEntities(
    supabase,
    rows.flatMap((r) => [r.home_team_id, r.away_team_id].filter((x): x is string => !!x)),
  )
  return rows.map((r) => ({
    id: r.id,
    competition_slug: r.competition_slug,
    season: r.season,
    matchday: r.matchday,
    stage: r.stage,
    phase: r.phase,
    kickoff_at: r.kickoff_at,
    status: r.status,
    home_score: r.home_score,
    away_score: r.away_score,
    home_team_name: r.home_team_name,
    away_team_name: r.away_team_name,
    home: r.home_team_id ? teamRefFromEntity(teams.get(r.home_team_id), true) : null,
    away: r.away_team_id ? teamRefFromEntity(teams.get(r.away_team_id), true) : null,
  }))
}

// ── football-data.org fallback (single competition) ──────────────────────────
// Mirrors apps/footshorts/worker/src/fixtures.ts; scoped to one competition so
// the admin can fill a missing (competition, season) on demand.

/** Thrown when the live fallback can't run (no token). Callers degrade to []. */
export class FootballDataUnavailableError extends Error {}

interface FdSeason {
  startDate: string
  endDate: string
}

/** "25-26" for multi-year leagues, "2025" for single-year cups. */
function normalizeSeason(s: FdSeason): string {
  const start = new Date(s.startDate).getUTCFullYear()
  const end = new Date(s.endDate).getUTCFullYear()
  if (start === end) return String(start)
  return `${String(start).slice(-2)}-${String(end).slice(-2)}`
}

/** "GROUP_A" → "Group A"; null/league → "". */
function formatGroupLabel(group: string | null | undefined): string {
  if (!group) return ''
  return group
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function normalizeStatus(s: string): string {
  switch (s) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'scheduled'
    case 'IN_PLAY':
    case 'PAUSED':
      return 'live'
    case 'FINISHED':
      return 'finished'
    case 'POSTPONED':
      return 'postponed'
    case 'SUSPENDED':
    case 'CANCELLED':
      return 'cancelled'
    default:
      return s.toLowerCase()
  }
}

async function fdFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${FD_BASE}${path}`, { headers: { 'X-Auth-Token': token } })
  if (!res.ok) {
    throw new Error(`football-data ${path} failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

/** Map football-data team ids → our entity uuid, for the FK columns. */
async function loadTeamIndex(supabase: Supabase): Promise<Map<number, string>> {
  const { data, error } = await supabase
    .from('entities')
    .select('id, football_data_id')
    .eq('type', 'team')
    .not('football_data_id', 'is', null)
  const map = new Map<number, string>()
  if (error || !data) return map
  for (const t of data as Array<{ id: string; football_data_id: number }>) {
    map.set(t.football_data_id, t.id)
  }
  return map
}

/** Resolve the league entity (slug → football_data_id) for the fallback. */
async function loadCompetition(
  supabase: Supabase,
  competitionSlug: string,
): Promise<{ slug: string; football_data_id: number } | null> {
  const { data, error } = await supabase
    .from('entities')
    .select('slug, football_data_id')
    .eq('type', 'league')
    .eq('slug', competitionSlug)
    .not('football_data_id', 'is', null)
    .maybeSingle()
  if (error || !data || data.football_data_id == null) return null
  return { slug: data.slug as string, football_data_id: data.football_data_id as number }
}

/**
 * Pull one competition's fixtures + standings from football-data.org and upsert
 * them, so a subsequent DB read returns the freshly-ingested (competition,
 * season). Throws FootballDataUnavailableError when no token is configured.
 */
export async function ingestCompetition(competitionSlug: string): Promise<void> {
  const token = process.env.FOOTBALL_DATA_TOKEN
  if (!token) throw new FootballDataUnavailableError('FOOTBALL_DATA_TOKEN not set')
  const supabase = createServiceClient()
  const comp = await loadCompetition(supabase, competitionSlug)
  if (!comp) throw new Error(`no league entity with football_data_id for "${competitionSlug}"`)
  const teamIndex = await loadTeamIndex(supabase)

  // Fixtures.
  const matchData = await fdFetch<{ matches: any[] }>(
    token,
    `/competitions/${comp.football_data_id}/matches`,
  )
  const fixtureRows = matchData.matches.map((m) => {
    const homeId = m.homeTeam?.id ? teamIndex.get(m.homeTeam.id) ?? null : null
    const awayId = m.awayTeam?.id ? teamIndex.get(m.awayTeam.id) ?? null : null
    return {
      football_data_id: m.id,
      competition_slug: comp.slug,
      season: normalizeSeason(m.season),
      matchday: m.matchday ?? null,
      stage: m.stage ?? null,
      home_team_id: homeId,
      away_team_id: awayId,
      home_team_name: homeId ? null : m.homeTeam?.name ?? 'TBD',
      away_team_name: awayId ? null : m.awayTeam?.name ?? 'TBD',
      kickoff_at: m.utcDate,
      status: normalizeStatus(m.status),
      home_score: m.score?.fullTime?.home ?? null,
      away_score: m.score?.fullTime?.away ?? null,
      home_ht_score: m.score?.halfTime?.home ?? null,
      away_ht_score: m.score?.halfTime?.away ?? null,
      venue: m.venue ?? null,
      updated_at: new Date().toISOString(),
    }
  })
  if (fixtureRows.length > 0) {
    const { error } = await supabase
      .from('fixtures')
      .upsert(fixtureRows, { onConflict: 'football_data_id' })
    if (error) throw error
  }

  // Standings (cups may have none — skip gracefully).
  let standData: { standings: any[]; season: FdSeason } | null = null
  try {
    standData = await fdFetch(token, `/competitions/${comp.football_data_id}/standings`)
  } catch {
    standData = null
  }
  if (!standData) return
  const totals = standData.standings.filter((s: any) => s.type === 'TOTAL')
  if (totals.length === 0) return
  const season = normalizeSeason(standData.season)
  const standingRows = totals.flatMap((table: any) => {
    const groupLabel = formatGroupLabel(table.group)
    const phase = table.group ? 'group' : 'league'
    return (table.table ?? [])
      .map((r: any) => {
        const teamId = teamIndex.get(r.team?.id)
        if (!teamId) return null
        return {
          competition_slug: comp.slug,
          season,
          team_id: teamId,
          group_label: groupLabel,
          phase,
          position: r.position,
          played: r.playedGames,
          won: r.won,
          draw: r.draw,
          lost: r.lost,
          goals_for: r.goalsFor,
          goals_against: r.goalsAgainst,
          goal_difference: r.goalDifference,
          points: r.points,
          form: r.form ?? null,
          updated_at: new Date().toISOString(),
        }
      })
      .filter((r: any): r is NonNullable<typeof r> => r !== null)
  })
  if (standingRows.length === 0) return
  // Clear then re-insert this competition+season (mirrors the worker).
  const { error: delError } = await supabase
    .from('standings')
    .delete()
    .eq('competition_slug', comp.slug)
    .eq('season', season)
  if (delError) throw delError
  const { error } = await supabase
    .from('standings')
    .upsert(standingRows, { onConflict: 'competition_slug,season,group_label,team_id' })
  if (error) throw error
}

// ── public API ───────────────────────────────────────────────────────────────

/** Distinct (competition, season) pairs that have any data, with league names
 *  for the picker dropdown. */
export async function listFootshortsCompetitions(): Promise<CompetitionOption[]> {
  const supabase = createServiceClient()
  const [standRes, fixRes, leagueRes] = await Promise.all([
    supabase.from('standings').select('competition_slug, season'),
    supabase.from('fixtures').select('competition_slug, season'),
    supabase.from('entities').select('slug, name').eq('type', 'league'),
  ])
  const names = new Map<string, string>()
  for (const l of (leagueRes.data ?? []) as Array<{ slug: string; name: string }>) {
    names.set(l.slug, l.name)
  }
  const acc = new Map<string, CompetitionOption>()
  const note = (slug: string, season: string, which: 'standings' | 'fixtures') => {
    if (!slug || !season) return
    const key = `${slug}::${season}`
    const existing =
      acc.get(key) ??
      { slug, season, name: names.get(slug) ?? slug, hasStandings: false, hasFixtures: false }
    if (which === 'standings') existing.hasStandings = true
    else existing.hasFixtures = true
    acc.set(key, existing)
  }
  for (const r of (standRes.data ?? []) as Array<{ competition_slug: string; season: string }>) {
    note(r.competition_slug, r.season, 'standings')
  }
  for (const r of (fixRes.data ?? []) as Array<{ competition_slug: string; season: string }>) {
    note(r.competition_slug, r.season, 'fixtures')
  }
  return Array.from(acc.values()).sort(
    (a, b) => a.name.localeCompare(b.name) || b.season.localeCompare(a.season),
  )
}

/** Standings rows for a competition+season. DB-first; live fallback on a miss
 *  (swallowed when no token — returns [] so the UI shows "nothing ingested"). */
export async function fetchStandings(
  competitionSlug: string,
  season: string,
): Promise<StandingRowInput[]> {
  const supabase = createServiceClient()
  const rows = await readStandingsFromDb(supabase, competitionSlug, season)
  if (rows.length > 0) return rows
  try {
    await ingestCompetition(competitionSlug)
  } catch (e) {
    if (e instanceof FootballDataUnavailableError) return []
    throw e
  }
  return readStandingsFromDb(supabase, competitionSlug, season)
}

/** Fixtures for a competition+season (optionally a phase/stage slice). DB-first
 *  with the same guarded live fallback. */
export async function fetchFixtures(q: FixtureQuery): Promise<FixtureRowInput[]> {
  const supabase = createServiceClient()
  const rows = await readFixturesFromDb(supabase, q)
  if (rows.length > 0) return rows
  try {
    await ingestCompetition(q.competitionSlug)
  } catch (e) {
    if (e instanceof FootballDataUnavailableError) return []
    throw e
  }
  return readFixturesFromDb(supabase, q)
}
