/**
 * FIFA World Cup 2026 importer — reads vizmaya-data/FIFA/wc2026_master.csv
 * (exported once from wc2026_master.xlsx, sheet "Master Data") and upserts
 * one row per qualified team into fifa_wc26_teams.
 *
 * Run locally:  pnpm fifa-wc26:import
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write access
 *
 * Idempotent on `code` (FIFA 3-letter team code).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '../../lib/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const CSV_PATH = resolve(process.cwd(), 'vizmaya-data/FIFA/wc2026_master.csv')

// Source name → FIFA 3-letter team code. FIFA codes are mostly ISO 3166-1
// alpha-3 with the usual football exceptions (ENG/SCO for England/Scotland
// who share GBR; NED, GER, POR, KOR, KSA, etc).
const NAME_TO_FIFA_CODE: Record<string, string> = {
  'United States': 'USA',
  Mexico: 'MEX',
  Canada: 'CAN',
  England: 'ENG',
  France: 'FRA',
  Spain: 'ESP',
  Portugal: 'POR',
  Germany: 'GER',
  Netherlands: 'NED',
  Belgium: 'BEL',
  Croatia: 'CRO',
  'Türkiye': 'TUR',
  Switzerland: 'SUI',
  Norway: 'NOR',
  Sweden: 'SWE',
  Austria: 'AUT',
  Czechia: 'CZE',
  Scotland: 'SCO',
  'Bosnia & Herz.': 'BIH',
  Argentina: 'ARG',
  Brazil: 'BRA',
  Colombia: 'COL',
  Uruguay: 'URU',
  Ecuador: 'ECU',
  Paraguay: 'PAR',
  Morocco: 'MAR',
  Senegal: 'SEN',
  'Ivory Coast': 'CIV',
  Algeria: 'ALG',
  Ghana: 'GHA',
  Egypt: 'EGY',
  Tunisia: 'TUN',
  'South Africa': 'RSA',
  'Cape Verde': 'CPV',
  Japan: 'JPN',
  'South Korea': 'KOR',
  Iran: 'IRN',
  Australia: 'AUS',
  'Saudi Arabia': 'KSA',
  Qatar: 'QAT',
  Uzbekistan: 'UZB',
  Jordan: 'JOR',
  Panama: 'PAN',
  Haiti: 'HAI',
  'Curaçao': 'CUW',
  'New Zealand': 'NZL',
  'DR Congo': 'COD',
  Iraq: 'IRQ',
}

// Country / territory centroids keyed by FIFA code. Hand-picked from the
// Google Public Data canonical list; good enough to drop a pin in roughly the
// right place. ENG/SCO are biased away from the UK centroid so the two pins
// don't sit on top of each other.
const TEAM_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  USA: { lat: 39.8, lng: -98.5 },
  MEX: { lat: 23.6, lng: -102.5 },
  CAN: { lat: 56.1, lng: -106.3 },
  ENG: { lat: 52.5, lng: -1.5 },
  FRA: { lat: 46.2, lng: 2.2 },
  ESP: { lat: 40.5, lng: -3.7 },
  POR: { lat: 39.5, lng: -8.0 },
  GER: { lat: 51.2, lng: 10.4 },
  NED: { lat: 52.1, lng: 5.3 },
  BEL: { lat: 50.5, lng: 4.5 },
  CRO: { lat: 45.1, lng: 15.2 },
  TUR: { lat: 39.0, lng: 35.2 },
  SUI: { lat: 46.8, lng: 8.2 },
  NOR: { lat: 60.5, lng: 8.5 },
  SWE: { lat: 60.1, lng: 18.6 },
  AUT: { lat: 47.5, lng: 14.5 },
  CZE: { lat: 49.8, lng: 15.5 },
  SCO: { lat: 56.8, lng: -4.2 },
  BIH: { lat: 43.9, lng: 17.7 },
  ARG: { lat: -38.4, lng: -63.6 },
  BRA: { lat: -14.2, lng: -51.9 },
  COL: { lat: 4.6, lng: -74.3 },
  URU: { lat: -32.5, lng: -55.8 },
  ECU: { lat: -1.8, lng: -78.2 },
  PAR: { lat: -23.4, lng: -58.4 },
  MAR: { lat: 31.8, lng: -7.1 },
  SEN: { lat: 14.5, lng: -14.5 },
  CIV: { lat: 7.5, lng: -5.5 },
  ALG: { lat: 28.0, lng: 1.7 },
  GHA: { lat: 7.9, lng: -1.0 },
  EGY: { lat: 26.8, lng: 30.8 },
  TUN: { lat: 33.9, lng: 9.5 },
  RSA: { lat: -30.6, lng: 22.9 },
  CPV: { lat: 16.0, lng: -24.0 },
  JPN: { lat: 36.2, lng: 138.3 },
  KOR: { lat: 35.9, lng: 127.8 },
  IRN: { lat: 32.4, lng: 53.7 },
  AUS: { lat: -25.3, lng: 133.8 },
  KSA: { lat: 23.9, lng: 45.1 },
  QAT: { lat: 25.4, lng: 51.2 },
  UZB: { lat: 41.4, lng: 64.6 },
  JOR: { lat: 30.6, lng: 36.2 },
  PAN: { lat: 8.5, lng: -80.8 },
  HAI: { lat: 18.9, lng: -72.3 },
  CUW: { lat: 12.2, lng: -69.0 },
  NZL: { lat: -40.9, lng: 174.9 },
  COD: { lat: -4.0, lng: 21.8 },
  IRQ: { lat: 33.2, lng: 43.7 },
}

interface TeamRow {
  code: string
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

function parseNumber(s: string | undefined | null): number | null {
  if (s == null || s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseInteger(s: string | undefined | null): number | null {
  const n = parseNumber(s)
  return n == null ? null : Math.round(n)
}

function parseBool(s: string | undefined | null): boolean {
  if (s == null) return false
  const v = String(s).trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

function parseRows(): TeamRow[] {
  const csv = readFileSync(CSV_PATH, 'utf8')
  const rows = parseCsv(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]

  const out: TeamRow[] = []
  for (const r of rows) {
    const name = r['Country']?.trim()
    if (!name) continue

    const code = NAME_TO_FIFA_CODE[name]
    if (!code) throw new Error(`No FIFA code mapping for country "${name}"`)
    const centroid = TEAM_CENTROIDS[code]
    if (!centroid) throw new Error(`No centroid for code "${code}" (${name})`)

    const qualification = r['Qualification']?.trim() ?? ''
    const is_host = qualification.startsWith('Host')
    const is_debut = parseBool(r['WC Debut?']) || qualification.endsWith('(Debut)')

    out.push({
      code,
      name,
      confederation: r['Confederation'].trim(),
      qualification,
      is_host,
      is_debut,
      lat: centroid.lat,
      lng: centroid.lng,
      squad_value_eur_mn: parseInteger(r['Squad Value (€mn)']),
      gdp_nominal_usd_bn: parseNumber(r['GDP nominal ($bn)']),
      gdp_per_capita_ppp_usd: parseInteger(r['GDP per capita PPP ($)']),
      population_mn: parseNumber(r['Population (mn)']),
      land_area_sq_km: parseInteger(r['Land area (sq km)']),
      gini_index: parseNumber(r['Gini index']),
      eiu_democracy_index_2024: parseNumber(r['EIU Dem. Index 2024']),
      regime_type: r['Regime type']?.trim() || null,
      fifa_ranking: parseInteger(r['FIFA Rank (Apr 2026)']),
      ghi_2025_score: parseNumber(r['GHI 2025 Score']),
      whr_2025_rank: parseInteger(r['WHR 2025 Rank']),
    })
  }
  return out
}

async function upsertTeams(rows: TeamRow[]): Promise<void> {
  const sb = createServiceClient()
  const batchSize = 100
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await sb
      .from('fifa_wc26_teams')
      .upsert(batch, { onConflict: 'code', ignoreDuplicates: false })
    if (error) throw new Error(`upsert fifa_wc26_teams: ${error.message}`)
  }
}

async function main(): Promise<void> {
  const rows = parseRows()
  console.log(`[fifa-wc26] parsed ${rows.length} teams from ${CSV_PATH}`)
  if (rows.length !== 48) {
    console.warn(`[fifa-wc26] expected 48 teams, got ${rows.length}`)
  }
  await upsertTeams(rows)
  console.log(`[fifa-wc26] upserted ${rows.length} team rows`)
}

main().catch((err) => {
  console.error('[fifa-wc26] failed:', err)
  process.exit(1)
})
