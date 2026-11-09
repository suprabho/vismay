import { createServiceClient } from '@vismay/content-source/supabase'
import type { CupFixture } from '@footshorts/shared/espnCups'
import { cupSeasonLabel, currentCupSeason } from '@footshorts/shared/espnCups'
import { fixturePatchFromDetail, type EspnMatchDetail } from '@footshorts/shared/espnMatch'
import {
  ESPN_LEAGUE_MATCH_TABLE,
  espnLeagueBySlug,
  readEspnFallbackSetting,
  writeEspnFallbackSetting,
  type EspnFallbackSetting,
} from '@footshorts/shared/espnLeagues'
import { formatCupMatchContext, type CupContextMatch, type CupContextTeam } from './espnCupContext'

/**
 * The ESPN fallback for league fixtures whose Opta match facts are missing
 * (worker espnMatchFacts.ts, the last step of the match-facts workflow).
 * Private admin data: every read here goes through the service role, after the
 * admin allowlist gate, and nothing consumer-facing imports this module. The
 * public HTML-stories brief never receives it (see footshortsHtmlStoryBrief's
 * `espnFallbackContext` hook, which only the admin brief route passes).
 */

export interface EspnLeagueMatchRow {
  fixture_id: string
  espn_event_id: string
  espn_league_code: string
  competition_slug: string
  detail: EspnMatchDetail
  fetched_at: string
}

const ROW_COLUMNS = 'fixture_id, espn_event_id, espn_league_code, competition_slug, detail, fetched_at'

export function espnFallbackSetting(): Promise<EspnFallbackSetting> {
  return readEspnFallbackSetting(createServiceClient())
}

export function setEspnFallbackEnabled(enabled: boolean, updatedBy: string | null): Promise<void> {
  return writeEspnFallbackSetting(createServiceClient(), enabled, updatedBy)
}

/** Stored ESPN detail for these fixtures, keyed by fixture id. A missing table
 * (migration not applied) reads as no rows. */
export async function listEspnLeagueMatches(fixtureIds: string[]): Promise<Map<string, EspnLeagueMatchRow>> {
  const out = new Map<string, EspnLeagueMatchRow>()
  if (fixtureIds.length === 0) return out
  const sb = createServiceClient()
  for (let i = 0; i < fixtureIds.length; i += 200) {
    const { data, error } = await sb.from(ESPN_LEAGUE_MATCH_TABLE).select(ROW_COLUMNS).in('fixture_id', fixtureIds.slice(i, i + 200))
    if (error) {
      console.warn('[espnLeagueFallback] read failed:', error.message)
      return out
    }
    for (const row of (data ?? []) as EspnLeagueMatchRow[]) out.set(row.fixture_id, row)
  }
  return out
}

/** The stored ESPN detail in the cup formatter's fixture shape. */
export function leagueRowToCupFixture(row: EspnLeagueMatchRow): CupFixture {
  const d = row.detail
  const patch = fixturePatchFromDetail(d)
  const kickoff = d.kickoff_at
  return {
    espn_event_id: row.espn_event_id,
    competition_slug: row.competition_slug,
    espn_competition_code: row.espn_league_code,
    season_start: currentCupSeason(kickoff ? new Date(kickoff) : new Date(row.fetched_at)),
    round_label: null,
    kickoff_at: kickoff,
    kickoff_time_confirmed: !!kickoff,
    status: patch.status,
    status_detail: patch.status_detail,
    home_espn_id: d.home.espn_id,
    away_espn_id: d.away.espn_id,
    home_team_name: d.home.name,
    away_team_name: d.away.name,
    home_score: patch.home_score,
    away_score: patch.away_score,
    home_penalties: patch.home_penalties,
    away_penalties: patch.away_penalties,
    winner_espn_id: patch.winner_espn_id,
    venue: d.venue,
    notes: d.notes ?? [],
    source_url: d.source_url,
    fetched_at: d.fetched_at,
  }
}

type FixtureTeams = { id: string; home_team_id: string | null; away_team_id: string | null }
type Entity = { id: string; slug: string; crest_url: string | null; primary_color: string | null }

/**
 * The admin HTML-story brief's ESPN supplement: for the picked fixtures that
 * have NO Opta facts but do have stored ESPN detail, ESPN's stats, timeline,
 * line-ups and commentary. Null when no picked fixture needs it.
 */
export async function buildLeagueEspnContext(
  fixtureIds: string[],
  { prompt, siteUrl }: { prompt?: string; siteUrl: string },
): Promise<string | null> {
  if (fixtureIds.length === 0) return null
  const sb = createServiceClient()
  const { data: opta, error: optaError } = await sb.from('opta_match_facts').select('fixture_id').in('fixture_id', fixtureIds)
  if (optaError) throw new Error(`opta_match_facts lookup failed: ${optaError.message}`)
  const withOpta = new Set((opta ?? []).map((r) => r.fixture_id as string))
  const rows = await listEspnLeagueMatches(fixtureIds.filter((id) => !withOpta.has(id)))
  if (rows.size === 0) return null

  const { data: fixtures } = await sb.from('fixtures').select('id, home_team_id, away_team_id').in('id', [...rows.keys()])
  const teamIds = [...new Set(((fixtures ?? []) as FixtureTeams[]).flatMap((f) => [f.home_team_id, f.away_team_id]).filter((x): x is string => !!x))]
  const { data: entities } = teamIds.length
    ? await sb.from('entities').select('id, slug, crest_url, primary_color').in('id', teamIds)
    : { data: [] as Entity[] }
  const entityById = new Map(((entities ?? []) as Entity[]).map((e) => [e.id, e]))
  const fixtureById = new Map(((fixtures ?? []) as FixtureTeams[]).map((f) => [f.id, f]))
  const site = siteUrl.replace(/\/$/, '')
  const team = (name: string, logo: string | null, color: string | null, entityId: string | null | undefined): CupContextTeam => {
    const e = entityId ? entityById.get(entityId) : undefined
    return {
      name,
      crestUrl: e?.crest_url ?? logo,
      color: e?.primary_color ?? color,
      pageUrl: e ? `${site}/team/${e.slug}` : null,
    }
  }

  const matches: CupContextMatch[] = fixtureIds.flatMap((id) => {
    const row = rows.get(id)
    if (!row) return []
    const f = fixtureById.get(id)
    const fixture = leagueRowToCupFixture(row)
    return [
      {
        fixture,
        cupName: espnLeagueBySlug(row.competition_slug)?.name ?? row.competition_slug,
        seasonLabel: cupSeasonLabel(fixture.season_start),
        home: team(row.detail.home.name, row.detail.home.logo_url, row.detail.home.color, f?.home_team_id),
        away: team(row.detail.away.name, row.detail.away.logo_url, row.detail.away.color, f?.away_team_id),
        detail: row.detail,
      },
    ]
  })
  return matches.length ? formatCupMatchContext(matches, { prompt, variant: 'league' }) : null
}
