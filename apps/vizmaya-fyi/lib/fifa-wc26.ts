/**
 * Server-side read helpers for the FIFA World Cup 2026 epic.
 *
 * The row IS the profile — there are no timeseries to assemble. The detail
 * sheet on /fifa-wc26 shows a team's metrics plus its rank among the 48 on
 * squad value and GDP per capita. Ranks are computed server-side and bundled
 * into the profile response.
 *
 * Schema: supabase/migrations/025_fifa_wc26.sql
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import {
  getShortfootDataForTeam,
  type ShortfootTeamData,
} from './shortfoot'

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
  const sb = createServiceClient()
  const { data, error } = await sb
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
  shortfoot: ShortfootTeamData
}

// Rank a metric value (1 = highest) given a sorted-desc list of all values.
// Nulls in the source rank null. For Gini, low = "more equal" but we still
// rank desc here — the UI labels what the rank means.
function rankOf(value: number | null, descSorted: number[]): number | null {
  if (value == null) return null
  // First index whose value is <= the target's value, then bump by 1 for 1-indexed.
  const idx = descSorted.findIndex((v) => v <= value)
  return idx === -1 ? descSorted.length : idx + 1
}

export async function getFifaWc26TeamProfile(
  code: string,
): Promise<FifaWc26TeamProfile | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
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

  // Static profile must render even if the shortfoot read errors out.
  // allSettled lets the rest of the response come back on any query failure.
  const shortfootResult = await Promise.allSettled([
    getShortfootDataForTeam(team.name),
  ])
  const shortfoot =
    shortfootResult[0].status === 'fulfilled'
      ? shortfootResult[0].value
      : (console.warn(
          `[fifa-wc26] shortfoot lookup failed for ${team.name}:`,
          shortfootResult[0].reason,
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
    shortfoot,
  }
}
