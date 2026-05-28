/**
 * Client-side read helpers for the FIFA World Cup 2026 epic landing.
 *
 * Ported from vizmaya-fyi's server-side `lib/fifa-wc26.ts` + `lib/footshorts.ts`.
 * Footshorts web is fully client-side, so these read through the anon Supabase
 * client (`./supabase`) instead of a service-role client. The `fifa_wc26_teams`
 * table is public-read (migration 025), and `entities` / `articles` / `fixtures`
 * are the same tables the Footshorts feed already reads — Footshorts and
 * vizmaya.fyi share one Supabase project.
 *
 * The row IS the profile — there are no timeseries to assemble. The detail
 * sheet shows a team's metrics plus its rank among the 48 on squad value and
 * GDP per capita; ranks are computed here.
 *
 * Schema: apps/vizmaya-fyi/supabase/migrations/025_fifa_wc26.sql
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface FifaWc26Team {
  code: string
  isoA2: string | null
  name: string
  confederation: string
  qualification: string
  isHost: boolean
  isDebut: boolean
  lat: number
  lng: number
  squadValueEurMn: number | null
  gdpNominalUsdBn: number | null
  gdpPerCapitaPppUsd: number | null
  populationMn: number | null
  landAreaSqKm: number | null
  giniIndex: number | null
  eiuDemocracyIndex2024: number | null
  regimeType: string | null
  fifaRanking: number | null
  ghi2025Score: number | null
  whr2025Rank: number | null
}

interface TeamRow {
  code: string
  iso_a2: string | null
  name: string
  confederation: string
  qualification: string
  is_host: boolean
  is_debut: boolean
  lat: number
  lng: number
  squad_value_eur_mn: number | null
  gdp_nominal_usd_bn: number | null
  gdp_per_capita_ppp_usd: number | null
  population_mn: number | null
  land_area_sq_km: number | null
  gini_index: number | null
  eiu_democracy_index_2024: number | null
  regime_type: string | null
  fifa_ranking: number | null
  ghi_2025_score: number | null
  whr_2025_rank: number | null
}

function shape(r: TeamRow): FifaWc26Team {
  return {
    code: r.code,
    isoA2: r.iso_a2,
    name: r.name,
    confederation: r.confederation,
    qualification: r.qualification,
    isHost: r.is_host,
    isDebut: r.is_debut,
    lat: r.lat,
    lng: r.lng,
    squadValueEurMn: r.squad_value_eur_mn,
    gdpNominalUsdBn: r.gdp_nominal_usd_bn,
    gdpPerCapitaPppUsd: r.gdp_per_capita_ppp_usd,
    populationMn: r.population_mn,
    landAreaSqKm: r.land_area_sq_km,
    giniIndex: r.gini_index,
    eiuDemocracyIndex2024: r.eiu_democracy_index_2024,
    regimeType: r.regime_type,
    fifaRanking: r.fifa_ranking,
    ghi2025Score: r.ghi_2025_score,
    whr2025Rank: r.whr_2025_rank,
  }
}

const SELECT_COLS =
  'code, iso_a2, name, confederation, qualification, is_host, is_debut, lat, lng, ' +
  'squad_value_eur_mn, gdp_nominal_usd_bn, gdp_per_capita_ppp_usd, ' +
  'population_mn, land_area_sq_km, gini_index, eiu_democracy_index_2024, regime_type, ' +
  'fifa_ranking, ghi_2025_score, whr_2025_rank'

export async function getFifaWc26Teams(): Promise<FifaWc26Team[]> {
  const { data, error } = await supabase
    .from('fifa_wc26_teams')
    .select(SELECT_COLS)
    .order('squad_value_eur_mn', { ascending: false, nullsFirst: false })
  if (error) throw new Error(`getFifaWc26Teams: ${error.message}`)
  return ((data ?? []) as unknown as TeamRow[]).map(shape)
}

export interface FifaWc26TeamProfile extends FifaWc26Team {
  ranks: {
    squadValue: number | null
    gdpNominal: number | null
    gdpPerCapita: number | null
    population: number | null
    landArea: number | null
    eiuDemocracyIndex: number | null
    giniIndex: number | null
  }
  total: number
  footshorts: FootshortsTeamData
}

// Rank a metric value (1 = highest) given a sorted-desc list of all values.
// Nulls in the source rank null. For Gini, low = "more equal" but we still
// rank desc here — the UI labels what the rank means.
function rankOf(value: number | null, descSorted: number[]): number | null {
  if (value == null) return null
  const idx = descSorted.findIndex((v) => v <= value)
  return idx === -1 ? descSorted.length : idx + 1
}

export async function getFifaWc26TeamProfile(
  code: string,
): Promise<FifaWc26TeamProfile | null> {
  const { data, error } = await supabase
    .from('fifa_wc26_teams')
    .select(SELECT_COLS)
    .order('squad_value_eur_mn', { ascending: false, nullsFirst: false })
  if (error) throw new Error(`getFifaWc26TeamProfile(${code}): ${error.message}`)

  const rows = ((data ?? []) as unknown as TeamRow[]).map(shape)
  const team = rows.find((r) => r.code === code)
  if (!team) return null

  const sortedDesc = (pick: (t: FifaWc26Team) => number | null): number[] =>
    rows
      .map(pick)
      .filter((v): v is number => v != null)
      .sort((a, b) => b - a)

  // Static profile must render even if the footshorts read errors out.
  // allSettled lets the rest of the response come back on any query failure.
  const footshortsResult = await Promise.allSettled([
    getFootshortsDataForTeam(team.name),
  ])
  const footshorts =
    footshortsResult[0].status === 'fulfilled'
      ? footshortsResult[0].value
      : (console.warn(
          `[fifa-wc26] footshorts lookup failed for ${team.name}:`,
          footshortsResult[0].reason,
        ),
        { news: [], fixtures: [] })

  return {
    ...team,
    total: rows.length,
    ranks: {
      squadValue: rankOf(team.squadValueEurMn, sortedDesc((t) => t.squadValueEurMn)),
      gdpNominal: rankOf(team.gdpNominalUsdBn, sortedDesc((t) => t.gdpNominalUsdBn)),
      gdpPerCapita: rankOf(team.gdpPerCapitaPppUsd, sortedDesc((t) => t.gdpPerCapitaPppUsd)),
      population: rankOf(team.populationMn, sortedDesc((t) => t.populationMn)),
      landArea: rankOf(team.landAreaSqKm, sortedDesc((t) => t.landAreaSqKm)),
      eiuDemocracyIndex: rankOf(
        team.eiuDemocracyIndex2024,
        sortedDesc((t) => t.eiuDemocracyIndex2024),
      ),
      giniIndex: rankOf(team.giniIndex, sortedDesc((t) => t.giniIndex)),
    },
    footshorts,
  }
}

// ---------------------------------------------------------------------------
// Footshorts news + fixtures join (ported from vizmaya lib/footshorts.ts).
// Surfaces RSS-derived news summaries and football-data.org fixtures so the
// team detail sheet can render per-team editorial + match data. Team-name →
// entity match uses the same slug normalization as Footshorts's worker.

export interface FootshortsNewsItem {
  id: string
  url: string
  title: string
  summary: string | null
  publisher: string | null
  publishedAt: string
  imageUrl: string | null
}

export interface FootshortsFixture {
  id: string
  kickoffAt: string
  status: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  venue: string | null
  competitionSlug: string
  isHome: boolean
}

export interface FootshortsTeamData {
  news: FootshortsNewsItem[]
  fixtures: FootshortsFixture[]
}

const EMPTY: FootshortsTeamData = { news: [], fixtures: [] }
const NEWS_LIMIT = 8
const FIXTURES_LIMIT = 10

// FIFA-name → footshorts-slug fixups for the few names where football-data.org
// and FIFA disagree. Slugs on the right must match footshorts's normalized
// entity slugs (lowercase, accents stripped, non-alphanum → "-").
const TEAM_ALIASES: Record<string, string> = {
  // football-data.org uses the IOC-style "Korea Republic" for South Korea.
  'south-korea': 'korea-republic',
  // FIFA uses "Türkiye"; football-data.org still labels it "Turkey".
  turkiye: 'turkey',
}

function normalizeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface EntityRow {
  id: string
  name: string
  country: string | null
}

async function resolveTeamEntity(
  sb: SupabaseClient,
  teamName: string,
): Promise<EntityRow | null> {
  const slug = normalizeSlug(teamName)
  const aliasedSlug = TEAM_ALIASES[slug]

  // Try canonical slug first, then alias, then a country-text fallback.
  const candidateSlugs = aliasedSlug ? [slug, aliasedSlug] : [slug]
  const { data: bySlug, error: slugErr } = await sb
    .from('entities')
    .select('id, name, country')
    .eq('type', 'team')
    .in('slug', candidateSlugs)
    .limit(1)
  if (slugErr) {
    console.warn(`[footshorts] entity slug lookup failed for ${teamName}: ${slugErr.message}`)
    return null
  }
  if (bySlug && bySlug.length > 0) return bySlug[0] as EntityRow

  // Fallback: country-name text match (case-insensitive). Helps for the long-
  // tail names not covered by aliases.
  const { data: byCountry, error: countryErr } = await sb
    .from('entities')
    .select('id, name, country')
    .eq('type', 'team')
    .ilike('country', teamName)
    .limit(1)
  if (countryErr) {
    console.warn(`[footshorts] entity country lookup failed for ${teamName}: ${countryErr.message}`)
    return null
  }
  return (byCountry?.[0] as EntityRow) ?? null
}

interface RawArticleRow {
  id: string
  url: string
  headline: string
  summary: string | null
  publisher: string | null
  image_url: string | null
  published_at: string
}

async function fetchNewsForEntity(
  sb: SupabaseClient,
  entityId: string,
): Promise<FootshortsNewsItem[]> {
  const { data, error } = await sb
    .from('articles')
    .select(
      'id, url, headline, summary, publisher, image_url, published_at, article_entities!inner(entity_id)',
    )
    .eq('article_entities.entity_id', entityId)
    .eq('status', 'summarized')
    .order('published_at', { ascending: false })
    .limit(NEWS_LIMIT)
  if (error) {
    console.warn(`[footshorts] news fetch failed for entity ${entityId}: ${error.message}`)
    return []
  }
  return ((data ?? []) as unknown as RawArticleRow[]).map((a) => ({
    id: a.id,
    url: a.url,
    title: a.headline,
    summary: a.summary,
    publisher: a.publisher,
    publishedAt: a.published_at,
    imageUrl: a.image_url,
  }))
}

interface RawFixtureRow {
  id: string
  competition_slug: string
  home_team_id: string | null
  away_team_id: string | null
  home_team_name: string | null
  away_team_name: string | null
  kickoff_at: string
  status: string
  home_score: number | null
  away_score: number | null
  venue: string | null
}

async function fetchFixturesForEntity(
  sb: SupabaseClient,
  entityId: string,
  ownTeamLabel: string,
): Promise<FootshortsFixture[]> {
  // Pull fixtures where the team is on either side. The raw-name match catches
  // the (rare) case where football-data.org didn't include this team in the
  // seed but listed it in a fixture row.
  const { data, error } = await sb
    .from('fixtures')
    .select(
      'id, competition_slug, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score, venue',
    )
    .or([`home_team_id.eq.${entityId}`, `away_team_id.eq.${entityId}`].join(','))
    .eq('competition_slug', 'world-cup')
    .order('kickoff_at', { ascending: true })
    .limit(FIXTURES_LIMIT)
  if (error) {
    console.warn(`[footshorts] fixtures fetch failed for entity ${entityId}: ${error.message}`)
    return []
  }
  const rows = (data ?? []) as unknown as RawFixtureRow[]
  if (rows.length === 0) return []

  // Resolve all referenced entity IDs in one batched lookup so we can show
  // proper team names rather than UUIDs.
  const ids = new Set<string>()
  for (const r of rows) {
    if (r.home_team_id) ids.add(r.home_team_id)
    if (r.away_team_id) ids.add(r.away_team_id)
  }
  const idToName = new Map<string, string>()
  if (ids.size > 0) {
    const { data: ents } = await sb
      .from('entities')
      .select('id, name')
      .in('id', Array.from(ids))
    for (const e of (ents ?? []) as Array<{ id: string; name: string }>) {
      idToName.set(e.id, e.name)
    }
  }

  return rows.map((r) => {
    const homeName =
      (r.home_team_id ? idToName.get(r.home_team_id) : null) ?? r.home_team_name ?? '—'
    const awayName =
      (r.away_team_id ? idToName.get(r.away_team_id) : null) ?? r.away_team_name ?? '—'
    const isHome = r.home_team_id === entityId || homeName === ownTeamLabel
    return {
      id: r.id,
      kickoffAt: r.kickoff_at,
      status: r.status,
      homeTeam: homeName,
      awayTeam: awayName,
      homeScore: r.home_score,
      awayScore: r.away_score,
      venue: r.venue,
      competitionSlug: r.competition_slug,
      isHome,
    }
  })
}

export async function getFootshortsDataForTeam(
  teamName: string,
): Promise<FootshortsTeamData> {
  const entity = await resolveTeamEntity(supabase, teamName)
  if (!entity) return EMPTY

  const [news, fixtures] = await Promise.all([
    fetchNewsForEntity(supabase, entity.id),
    fetchFixturesForEntity(supabase, entity.id, entity.name),
  ])
  return { news, fixtures }
}

// ---------------------------------------------------------------------------
// WC26 squads: per-country roster + league/club composition breakdown.
// Reads the wc26_squad_players view (public-read, security_invoker). Players
// whose club didn't resolve to an entity carry club_name_raw and no league.

export interface FifaWc26SquadPlayer {
  playerEntityId: string
  playerSlug: string | null
  playerName: string
  jersey: number | null
  position: string | null
  role: 'captain' | 'vice_captain' | null
  dateOfBirth: string | null
  primaryPosition: string | null
  heightCm: number | null
  foot: 'left' | 'right' | 'both' | null
  clubEntityId: string | null
  clubSlug: string | null
  clubName: string | null
  clubCrestUrl: string | null
  clubPrimaryColor: string | null
  clubNameRaw: string | null
  leagueSlug: string | null
  leagueName: string | null
  photoUrl: string | null
  source: string
}

export interface SquadGroupClub {
  clubSlug: string | null
  clubName: string
  clubCrestUrl: string | null
  clubPrimaryColor: string | null
  count: number
  matched: boolean
}

export interface SquadGroupLeague {
  leagueSlug: string | null
  leagueName: string
  count: number
  clubs: SquadGroupClub[]
}

export interface FifaWc26Squad {
  players: FifaWc26SquadPlayer[]
  byLeague: SquadGroupLeague[]
  total: number
  unmatched: number
}

interface SquadPlayerRow {
  country_code: string
  player_entity_id: string
  player_slug: string | null
  player_name: string
  player_nationality: string | null
  player_photo_url: string | null
  date_of_birth: string | null
  primary_position: string | null
  height_cm: number | null
  foot: 'left' | 'right' | 'both' | null
  jersey: number | null
  position: string | null
  role: 'captain' | 'vice_captain' | null
  club_entity_id: string | null
  club_slug: string | null
  club_name: string | null
  club_crest_url: string | null
  club_primary_color: string | null
  club_name_raw: string | null
  squad_photo_url: string | null
  source: string
  announced_at: string
}

const UNMATCHED_LEAGUE_LABEL = 'Other clubs'

export async function getFifaWc26Squad(code: string): Promise<FifaWc26Squad> {
  const { data, error } = await supabase
    .from('wc26_squad_players')
    .select('*')
    .eq('country_code', code)
    .order('jersey', { ascending: true, nullsFirst: false })
  if (error) throw new Error(`getFifaWc26Squad(${code}): ${error.message}`)
  const rows = (data ?? []) as unknown as SquadPlayerRow[]
  if (rows.length === 0) {
    return { players: [], byLeague: [], total: 0, unmatched: 0 }
  }

  // Resolve league_slug → league name for any club whose entity row carries
  // a league. The view doesn't include league_slug (clubs are denormalized
  // with it), so we batch the lookup here.
  const clubIds = Array.from(
    new Set(rows.map((r) => r.club_entity_id).filter((id): id is string => !!id)),
  )
  const clubIdToLeagueSlug = new Map<string, string | null>()
  if (clubIds.length > 0) {
    const { data: clubRows, error: clubErr } = await supabase
      .from('entities')
      .select('id, league_slug')
      .in('id', clubIds)
    if (clubErr) {
      console.warn(`[fifa-wc26] club->league lookup failed: ${clubErr.message}`)
    } else {
      for (const c of (clubRows ?? []) as Array<{ id: string; league_slug: string | null }>) {
        clubIdToLeagueSlug.set(c.id, c.league_slug ?? null)
      }
    }
  }
  const leagueSlugs = Array.from(
    new Set(
      Array.from(clubIdToLeagueSlug.values()).filter((s): s is string => !!s),
    ),
  )
  const leagueSlugToName = new Map<string, string>()
  if (leagueSlugs.length > 0) {
    const { data: leagueRows, error: leagueErr } = await supabase
      .from('entities')
      .select('slug, name')
      .eq('type', 'league')
      .in('slug', leagueSlugs)
    if (leagueErr) {
      console.warn(`[fifa-wc26] league name lookup failed: ${leagueErr.message}`)
    } else {
      for (const l of (leagueRows ?? []) as Array<{ slug: string; name: string }>) {
        leagueSlugToName.set(l.slug, l.name)
      }
    }
  }

  const players: FifaWc26SquadPlayer[] = rows.map((r) => {
    const leagueSlug = r.club_entity_id ? clubIdToLeagueSlug.get(r.club_entity_id) ?? null : null
    const leagueName = leagueSlug ? leagueSlugToName.get(leagueSlug) ?? leagueSlug : null
    return {
      playerEntityId: r.player_entity_id,
      playerSlug: r.player_slug,
      playerName: r.player_name,
      jersey: r.jersey,
      position: r.position,
      role: r.role,
      dateOfBirth: r.date_of_birth,
      primaryPosition: r.primary_position,
      heightCm: r.height_cm,
      foot: r.foot,
      clubEntityId: r.club_entity_id,
      clubSlug: r.club_slug,
      clubName: r.club_name,
      clubCrestUrl: r.club_crest_url,
      clubPrimaryColor: r.club_primary_color,
      clubNameRaw: r.club_name_raw,
      leagueSlug,
      leagueName,
      photoUrl: r.squad_photo_url ?? r.player_photo_url,
      source: r.source,
    }
  })

  // Group: league -> clubs -> count. Unmatched clubs (no entity) and matched
  // clubs without a league_slug both land under "Other clubs".
  const leagueMap = new Map<string, SquadGroupLeague>()
  const unmatchedLeagueKey = '__unmatched__'
  for (const p of players) {
    const leagueKey = p.leagueSlug ?? unmatchedLeagueKey
    const leagueName = p.leagueName ?? UNMATCHED_LEAGUE_LABEL
    let league = leagueMap.get(leagueKey)
    if (!league) {
      league = {
        leagueSlug: p.leagueSlug,
        leagueName,
        count: 0,
        clubs: [],
      }
      leagueMap.set(leagueKey, league)
    }
    league.count += 1

    const matched = !!p.clubEntityId
    const clubLabel = p.clubName ?? p.clubNameRaw ?? '—'
    const clubKey = matched ? `e:${p.clubEntityId}` : `r:${clubLabel.toLowerCase()}`
    let club = league.clubs.find((c) =>
      matched
        ? c.clubSlug === p.clubSlug && c.matched
        : c.clubName === clubLabel && !c.matched,
    )
    if (!club) {
      club = {
        clubSlug: matched ? p.clubSlug : null,
        clubName: clubLabel,
        clubCrestUrl: matched ? p.clubCrestUrl : null,
        clubPrimaryColor: matched ? p.clubPrimaryColor : null,
        count: 0,
        matched,
      }
      league.clubs.push(club)
    }
    club.count += 1
    void clubKey
  }

  const byLeague = Array.from(leagueMap.values())
    .map((l) => ({
      ...l,
      clubs: l.clubs.sort((a, b) => b.count - a.count || a.clubName.localeCompare(b.clubName)),
    }))
    .sort((a, b) => {
      // "Other clubs" always last
      if (a.leagueSlug == null && b.leagueSlug != null) return 1
      if (a.leagueSlug != null && b.leagueSlug == null) return -1
      return b.count - a.count || a.leagueName.localeCompare(b.leagueName)
    })

  const unmatched = players.filter((p) => !p.clubEntityId).length

  return { players, byLeague, total: players.length, unmatched }
}
