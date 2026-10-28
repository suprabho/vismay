import { createServiceClient } from '@vismay/content-source/supabase'
import { resolveTeamsByLabel, type TeamBrandRow } from '@vismay/content-source/footshortsData'
import type { FixtureRow, FixtureStatus, FixtureTeamRef } from '@vismay/footshorts-viz/types'
import { ESPN_CUPS, ESPN_CUP_TABLE, cupSeasonLabel, currentCupSeason, validCupSeason, type CupFixture, type CupStatus, type EspnCup } from '@footshorts/shared/espnCups'
import { formatCupMatchContext, type CupContextTeam } from './espnCupContext'
import { ESPN_MATCH_DETAIL_TABLE, extractEspnMatch, type EspnMatchDetail, type EspnMatchEvent } from '@footshorts/shared/espnMatch'

// Do not send the raw archive payload to the browser. This data path is only
// called after the admin allowlist gate; consumer routes never import it.
const COLUMNS = 'espn_event_id,competition_slug,espn_competition_code,season_start,round_label,kickoff_at,kickoff_time_confirmed,status,status_detail,home_espn_id,away_espn_id,home_team_name,away_team_name,home_score,away_score,home_penalties,away_penalties,winner_espn_id,venue,notes,source_url,fetched_at'

/** A cup fixture plus whether its ESPN match detail has been extracted. */
export type CupFixtureListRow = CupFixture & { detail_fetched_at: string | null; detail_event_count: number | null }

export function findEspnCup(slug: string) {
  return ESPN_CUPS.find(c => c.slug === slug)
}

/** True when the error means the private match-detail table has not been
 * created yet (migration 20260918000000 not applied). */
function isMissingDetailTable(message: string): boolean {
  return /admin_espn_cup_match_details/.test(message) && /does not exist|schema cache|not find/i.test(message)
}

const DETAIL_TABLE_HINT = 'Match-detail storage is unavailable. Apply the admin_espn_cup_match_details migration first.'

export async function listEspnCups(season: number, competition?: string): Promise<CupFixtureListRow[]> {
  const sb = createServiceClient()
  const rows: CupFixture[] = []
  for (let offset = 0; offset < 5000; offset += 1000) {
    let query = sb.from(ESPN_CUP_TABLE).select(COLUMNS).eq('season_start', season)
      .order('kickoff_at', { ascending: true, nullsFirst: false }).order('espn_event_id')
      .range(offset, offset + 999)
    if (competition) query = query.eq('competition_slug', competition)
    const { data, error } = await query
    if (error) throw new Error(`Could not load cup fixtures: ${error.message}`)
    rows.push(...(data ?? []) as CupFixture[])
    if ((data?.length ?? 0) < 1000) return attachDetailState(sb, rows)
  }
  throw new Error('Too many matches to display together. Select one competition.')
}

/** Left-join the extraction state. Tolerates the detail table not existing
 * yet so the fixtures list keeps working before the migration is applied. */
async function attachDetailState(sb: ReturnType<typeof createServiceClient>, rows: CupFixture[]): Promise<CupFixtureListRow[]> {
  const state = new Map<string, { fetched_at: string; event_count: number }>()
  for (let i = 0; i < rows.length; i += 500) {
    const ids = rows.slice(i, i + 500).map(r => r.espn_event_id)
    const { data, error } = await sb.from(ESPN_MATCH_DETAIL_TABLE).select('espn_event_id,fetched_at,event_count').in('espn_event_id', ids)
    if (error) {
      if (isMissingDetailTable(error.message)) break
      throw new Error(`Could not load match details: ${error.message}`)
    }
    for (const d of (data ?? []) as { espn_event_id: string; fetched_at: string; event_count: number }[]) {
      state.set(d.espn_event_id, { fetched_at: d.fetched_at, event_count: d.event_count })
    }
  }
  return rows.map(r => ({
    ...r,
    detail_fetched_at: state.get(r.espn_event_id)?.fetched_at ?? null,
    detail_event_count: state.get(r.espn_event_id)?.event_count ?? null,
  }))
}

export async function getEspnCupFixture(eventId: string): Promise<CupFixture | null> {
  const sb = createServiceClient()
  const { data, error } = await sb.from(ESPN_CUP_TABLE).select(COLUMNS).eq('espn_event_id', eventId).maybeSingle()
  if (error) throw new Error(`Could not load cup fixture: ${error.message}`)
  return (data as CupFixture | null) ?? null
}

/** Stored ESPN match detail, or null when not extracted yet. */
export async function getEspnMatchDetail(eventId: string): Promise<EspnMatchDetail | null> {
  const sb = createServiceClient()
  const { data, error } = await sb.from(ESPN_MATCH_DETAIL_TABLE).select('detail').eq('espn_event_id', eventId).maybeSingle()
  if (error) throw new Error(isMissingDetailTable(error.message) ? DETAIL_TABLE_HINT : `Could not load match detail: ${error.message}`)
  return (data?.detail as EspnMatchDetail | undefined) ?? null
}

/** Fetch the match from ESPN and store it (upsert). The fixture must already
 * be imported; the detail row references it. */
export async function extractEspnMatchDetail(eventId: string): Promise<EspnMatchDetail> {
  const fixture = await getEspnCupFixture(eventId)
  if (!fixture) throw new Error('This match has not been imported. Fetch its cup first.')
  const cup = findEspnCup(fixture.competition_slug)
  if (!cup) throw new Error(`Unknown competition ${fixture.competition_slug}`)
  try {
    const stored = await extractEspnMatch(createServiceClient(), fixture, cup)
    return stored.detail
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed'
    throw new Error(isMissingDetailTable(message) ? DETAIL_TABLE_HINT : message)
  }
}

// ── share-card studio bridge ─────────────────────────────────────────────────
//
// The studio resolves `fscard:match` / `fscard:match-timeline` layers against
// FixtureRow + FixtureEvent shapes fetched from the admin data routes. These
// helpers serve the private ESPN cup tables in those shapes (admin-only; the
// consumer apps never see this data). Season labels use the "2025/26" form so
// an ESPN cup never collides with a football-data cup season ("2025").

export interface EspnCupCompetitionOption {
  slug: string
  name: string
  crestUrl: string | null
  primaryColor: string | null
  season: string
  hasStandings: false
  hasFixtures: true
  source: 'espn'
}

export function parseEspnSeasonLabel(label: string): number | null {
  const m = /^(\d{4})\/\d{2}$/.exec(label.trim())
  if (!m) return null
  const year = Number(m[1])
  return validCupSeason(year) ? year : null
}

/** Every (cup, season) with imported fixtures, for the studio's competition picker. */
export async function listEspnCupCompetitions(): Promise<EspnCupCompetitionOption[]> {
  const sb = createServiceClient()
  const [{ data, error }, leagues] = await Promise.all([
    sb.from(ESPN_CUP_TABLE).select('competition_slug,season_start').limit(5000),
    sb.from('entities').select('slug,crest_url,primary_color').eq('type', 'league').in('slug', ESPN_CUPS.map(c => c.slug)),
  ])
  if (error) throw new Error(`Could not list cup competitions: ${error.message}`)
  const branding = new Map((leagues.data ?? []).map(l => [l.slug as string, l as { crest_url: string | null; primary_color: string | null }]))
  const seen = new Map<string, EspnCupCompetitionOption>()
  for (const r of (data ?? []) as { competition_slug: string; season_start: number }[]) {
    const cup = findEspnCup(r.competition_slug)
    if (!cup || !validCupSeason(r.season_start)) continue
    const season = cupSeasonLabel(r.season_start)
    const key = `${cup.slug}::${season}`
    if (seen.has(key)) continue
    seen.set(key, {
      slug: cup.slug,
      name: cup.name,
      crestUrl: branding.get(cup.slug)?.crest_url ?? null,
      primaryColor: branding.get(cup.slug)?.primary_color ?? null,
      season,
      hasStandings: false,
      hasFixtures: true,
      source: 'espn',
    })
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || b.season.localeCompare(a.season))
}

const STATUS_MAP: Record<CupStatus, FixtureStatus> = {
  scheduled: 'scheduled', live: 'live', finished: 'finished', postponed: 'postponed',
  cancelled: 'cancelled', suspended: 'postponed', unknown: 'scheduled',
}

function slugify(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team'
}

/** A team ref for a cup fixture. ESPN gives us only an id and a display name,
 * so the crest + brand colour come from our own `entities` row when the name
 * resolves to one (the values the Asset Studio edits — a cup card then matches
 * the league card for the same club), with ESPN's team-logo CDN as the crest
 * fallback. The id stays ESPN's: nothing downstream keys cup teams by entity. */
function espnTeamRef(espnId: string | null, name: string, entity?: TeamBrandRow): FixtureTeamRef {
  return {
    id: espnId ? `espn:${espnId}` : `espn:${slugify(name)}`,
    slug: entity?.slug ?? slugify(name),
    name,
    crest_url: entity?.crest_url ?? (espnId ? `https://a.espncdn.com/i/teamlogos/soccer/500/${espnId}.png` : null),
    primary_color: entity?.primary_color ?? null,
  }
}

/** Resolve every team name in the list to an entity, keyed by ESPN's name.
 * Best-effort: a lookup failure logs and leaves the ESPN-only refs, so the
 * fixtures list never breaks over branding. */
async function resolveCupTeams(rows: CupFixture[]): Promise<Map<string, TeamBrandRow>> {
  const labels = new Set<string>()
  for (const r of rows) {
    labels.add(r.home_team_name)
    labels.add(r.away_team_name)
  }
  try {
    return await resolveTeamsByLabel(createServiceClient(), Array.from(labels))
  } catch (error) {
    console.warn('[espnCups] team lookup failed, falling back to ESPN crests:', error instanceof Error ? error.message : error)
    return new Map()
  }
}

/** A stored cup fixture in the studio's FixtureRow shape. The id is the ESPN
 * event id, which the events route recognises (numeric, not a uuid). */
export function cupFixtureToFixtureRow(
  f: CupFixture,
  cup: EspnCup,
  teams: ReadonlyMap<string, TeamBrandRow> = new Map(),
): FixtureRow {
  return {
    id: f.espn_event_id,
    competition_slug: cup.slug,
    season: cupSeasonLabel(f.season_start),
    matchday: null,
    stage: f.round_label,
    phase: 'knockout',
    kickoff_at: f.kickoff_at ?? new Date(Date.UTC(f.season_start, 6, 1)).toISOString(),
    status: STATUS_MAP[f.status] ?? 'scheduled',
    home_score: f.home_score,
    away_score: f.away_score,
    home_team_name: f.home_team_name,
    away_team_name: f.away_team_name,
    home: espnTeamRef(f.home_espn_id, f.home_team_name, teams.get(f.home_team_name)),
    away: espnTeamRef(f.away_espn_id, f.away_team_name, teams.get(f.away_team_name)),
  }
}

export async function listEspnCupFixtureRows(competitionSlug: string, seasonLabel: string): Promise<FixtureRow[]> {
  const cup = findEspnCup(competitionSlug)
  const season = parseEspnSeasonLabel(seasonLabel)
  if (!cup || season == null) return []
  const rows = await listEspnCups(season, cup.slug)
  const teams = await resolveCupTeams(rows)
  return rows.map(r => cupFixtureToFixtureRow(r, cup, teams))
}

export function isEspnEventId(id: string): boolean {
  return /^\d+$/.test(id)
}

/** Timeline rows for a cup fixture, in the fixture_events shape. Empty until
 * the match detail has been extracted. */
export async function listEspnFixtureEvents(eventId: string): Promise<EspnMatchEvent[]> {
  const detail = await getEspnMatchDetail(eventId)
  return detail?.events ?? []
}

// ── HTML-story brief bridge ──────────────────────────────────────────────────
//
// The HTML-stories match picker lists the imported cups next to the other
// competitions, and the brief route builds their context from the stored
// fixture + extracted detail (./espnCupContext). Admin-only, like the rest.

/** A cup fixture as the match picker lists it (MatchOption's shape). `facts`
 * = the ESPN match detail has been extracted; `events` = its timeline count. */
export interface EspnCupMatchOption {
  id: string
  home: string
  away: string
  kickoffAt: string
  status: FixtureStatus
  homeScore: number | null
  awayScore: number | null
  matchday: null
  stage: string | null
  competition: string
  competitionName: string
  season: string
  facts: boolean
  events: number
  insights: 0
  source: 'espn'
}

function cupMatchOption(r: CupFixtureListRow, cup: EspnCup): EspnCupMatchOption {
  return {
    id: r.espn_event_id,
    home: r.home_team_name,
    away: r.away_team_name,
    kickoffAt: r.kickoff_at ?? new Date(Date.UTC(r.season_start, 6, 1)).toISOString(),
    status: STATUS_MAP[r.status] ?? 'scheduled',
    homeScore: r.home_score,
    awayScore: r.away_score,
    matchday: null,
    stage: r.round_label,
    competition: cup.slug,
    competitionName: `${cup.name} (ESPN)`,
    season: cupSeasonLabel(r.season_start),
    facts: r.detail_fetched_at != null,
    events: r.detail_event_count ?? 0,
    insights: 0,
    source: 'espn',
  }
}

/** One cup season's matches for the picker; empty unless `seasonLabel` is a "2025/26" cup season. */
export async function listEspnCupMatchOptions(competitionSlug: string, seasonLabel: string): Promise<EspnCupMatchOption[]> {
  const cup = findEspnCup(competitionSlug)
  const season = parseEspnSeasonLabel(seasonLabel)
  if (!cup || season == null) return []
  return (await listEspnCups(season, cup.slug)).map(r => cupMatchOption(r, cup))
}

/** A team's cup ties (this season and last), matched by resolving ESPN's team
 * names to our entities. Best-effort: any failure answers no cup ties. */
export async function listEspnCupMatchOptionsForTeam(teamSlug: string, now = new Date()): Promise<EspnCupMatchOption[]> {
  try {
    const current = currentCupSeason(now)
    const rows = (await Promise.all([listEspnCups(current), listEspnCups(current - 1)])).flat()
    const teams = await resolveCupTeams(rows)
    return rows
      .filter(r => teams.get(r.home_team_name)?.slug === teamSlug || teams.get(r.away_team_name)?.slug === teamSlug)
      .flatMap(r => {
        const cup = findEspnCup(r.competition_slug)
        return cup ? [cupMatchOption(r, cup)] : []
      })
  } catch (error) {
    console.warn('[espnCups] team cup ties failed:', error instanceof Error ? error.message : error)
    return []
  }
}

/** The HTML-story brief's context for these cup matches (ESPN event ids). */
export async function buildCupMatchContext(eventIds: string[], { prompt, siteUrl }: { prompt?: string; siteUrl: string }): Promise<string> {
  const fixtures = (await Promise.all(eventIds.map(id => getEspnCupFixture(id)))).filter((f): f is CupFixture => !!f)
  if (!fixtures.length) throw new Error('no such cup fixtures (import the cup in Cup fixtures first)')
  const [details, teams] = await Promise.all([
    Promise.all(fixtures.map(f => getEspnMatchDetail(f.espn_event_id).catch(() => null))),
    resolveCupTeams(fixtures),
  ])
  const site = siteUrl.replace(/\/$/, '')
  const team = (name: string, espnId: string | null, color: string | null | undefined): CupContextTeam => {
    const ref = espnTeamRef(espnId, name, teams.get(name))
    const entity = teams.get(name)
    return {
      name,
      crestUrl: ref?.crest_url ?? null,
      color: entity?.primary_color ?? color ?? null,
      pageUrl: entity ? `${site}/team/${entity.slug}` : null,
    }
  }
  return formatCupMatchContext(
    fixtures.flatMap((f, i) => {
      const cup = findEspnCup(f.competition_slug)
      if (!cup) return []
      const d = details[i] ?? null
      return [{
        fixture: f,
        cupName: cup.name,
        seasonLabel: cupSeasonLabel(f.season_start),
        home: team(f.home_team_name, f.home_espn_id, d?.home.color),
        away: team(f.away_team_name, f.away_espn_id, d?.away.color),
        detail: d,
      }]
    }),
    { prompt },
  )
}
