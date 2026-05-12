/**
 * OWID energy importer — pulls Our World in Data's energy panel
 * (owid-energy-data.csv) and writes per-country indicator rows into
 * iea_country_energy (and upserts country rows into iea_countries).
 *
 * Why OWID and not iea.org directly? The IEA fronts a JS-driven SPA behind
 * Cloudflare bot detection (same reason scrape-news.ts uses Google News RSS
 * instead). OWID republishes the same Energy Institute Statistical Review +
 * Ember + EIA inputs as one CC BY 4.0 CSV that covers ~200 countries back to
 * 1900. They refresh annually each April.
 *
 * Run locally:  pnpm iea:import-owid
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write access
 *
 * Idempotency: upserts on (code) for iea_countries and
 * (country_code, indicator, year) for iea_country_energy, so re-runs only
 * touch rows that changed. Existing editorial `summary` values on
 * iea_countries are preserved.
 */

import { parse as parseCsv } from 'csv-parse/sync'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '../../lib/supabase'
import { COUNTRY_CENTROIDS } from '../../lib/iea/countryCentroids'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const OWID_CSV_URL =
  'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv'

// Year floor — OWID has data back to 1900 but the charts only need recent
// decades and trimming keeps the row count manageable (~200 × 22 × 30 ≈ 130k).
const MIN_YEAR = 1995

// OWID column → indicator key. The keys are what the API + charts read,
// so renaming here means renaming there too.
const INDICATOR_MAP: Record<string, string> = {
  // Electricity mix (Chart 1)
  coal_share_elec: 'elec_share_coal',
  gas_share_elec: 'elec_share_gas',
  oil_share_elec: 'elec_share_oil',
  nuclear_share_elec: 'elec_share_nuclear',
  hydro_share_elec: 'elec_share_hydro',
  solar_share_elec: 'elec_share_solar',
  wind_share_elec: 'elec_share_wind',
  biofuel_share_elec: 'elec_share_biofuel',
  other_renewables_share_elec_exc_biofuel: 'elec_share_other_renew',
  // Primary energy mix (Chart 2)
  coal_share_energy: 'primary_share_coal',
  gas_share_energy: 'primary_share_gas',
  oil_share_energy: 'primary_share_oil',
  nuclear_share_energy: 'primary_share_nuclear',
  hydro_share_energy: 'primary_share_hydro',
  solar_share_energy: 'primary_share_solar',
  wind_share_energy: 'primary_share_wind',
  biofuel_share_energy: 'primary_share_biofuel',
  other_renewables_share_energy: 'primary_share_other_renew',
  // Single-series charts (Chart 3, 4)
  greenhouse_gas_emissions: 'ghg_from_energy_mt',
  renewables_share_elec: 'renewables_share_elec',
  // Stat tiles
  energy_per_capita: 'energy_per_capita_kwh',
  renewables_share_energy: 'renewables_share_energy',
  electricity_demand: 'electricity_demand_twh',
}

// ISO 3166-1 alpha-3 → alpha-2. Covers every country OWID emits with a
// non-empty `iso_code` column. Codes for which we don't have a centroid in
// lib/iea/countryCentroids.ts are dropped at the import step.
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  AFG: 'AF', ALB: 'AL', DZA: 'DZ', AND: 'AD', AGO: 'AO', ATG: 'AG', ARG: 'AR',
  ARM: 'AM', AUS: 'AU', AUT: 'AT', AZE: 'AZ', BHS: 'BS', BHR: 'BH', BGD: 'BD',
  BRB: 'BB', BLR: 'BY', BEL: 'BE', BLZ: 'BZ', BEN: 'BJ', BTN: 'BT', BOL: 'BO',
  BIH: 'BA', BWA: 'BW', BRA: 'BR', BRN: 'BN', BGR: 'BG', BFA: 'BF', BDI: 'BI',
  CPV: 'CV', KHM: 'KH', CMR: 'CM', CAN: 'CA', CAF: 'CF', TCD: 'TD', CHL: 'CL',
  CHN: 'CN', COL: 'CO', COM: 'KM', COG: 'CG', COD: 'CD', CRI: 'CR', CIV: 'CI',
  HRV: 'HR', CUB: 'CU', CYP: 'CY', CZE: 'CZ', DNK: 'DK', DJI: 'DJ', DMA: 'DM',
  DOM: 'DO', ECU: 'EC', EGY: 'EG', SLV: 'SV', GNQ: 'GQ', ERI: 'ER', EST: 'EE',
  SWZ: 'SZ', ETH: 'ET', FJI: 'FJ', FIN: 'FI', FRA: 'FR', GAB: 'GA', GMB: 'GM',
  GEO: 'GE', DEU: 'DE', GHA: 'GH', GRC: 'GR', GRD: 'GD', GTM: 'GT', GIN: 'GN',
  GNB: 'GW', GUY: 'GY', HTI: 'HT', HND: 'HN', HKG: 'HK', HUN: 'HU', ISL: 'IS',
  IND: 'IN', IDN: 'ID', IRN: 'IR', IRQ: 'IQ', IRL: 'IE', ISR: 'IL', ITA: 'IT',
  JAM: 'JM', JPN: 'JP', JOR: 'JO', KAZ: 'KZ', KEN: 'KE', KIR: 'KI', PRK: 'KP',
  KOR: 'KR', KWT: 'KW', KGZ: 'KG', LAO: 'LA', LVA: 'LV', LBN: 'LB', LSO: 'LS',
  LBR: 'LR', LBY: 'LY', LIE: 'LI', LTU: 'LT', LUX: 'LU', MAC: 'MO', MDG: 'MG',
  MWI: 'MW', MYS: 'MY', MDV: 'MV', MLI: 'ML', MLT: 'MT', MHL: 'MH', MRT: 'MR',
  MUS: 'MU', MEX: 'MX', FSM: 'FM', MDA: 'MD', MCO: 'MC', MNG: 'MN', MNE: 'ME',
  MAR: 'MA', MOZ: 'MZ', MMR: 'MM', NAM: 'NA', NRU: 'NR', NPL: 'NP', NLD: 'NL',
  NZL: 'NZ', NIC: 'NI', NER: 'NE', NGA: 'NG', MKD: 'MK', NOR: 'NO', OMN: 'OM',
  PAK: 'PK', PLW: 'PW', PSE: 'PS', PAN: 'PA', PNG: 'PG', PRY: 'PY', PER: 'PE',
  PHL: 'PH', POL: 'PL', PRT: 'PT', PRI: 'PR', QAT: 'QA', ROU: 'RO', RUS: 'RU',
  RWA: 'RW', KNA: 'KN', LCA: 'LC', VCT: 'VC', WSM: 'WS', SMR: 'SM', STP: 'ST',
  SAU: 'SA', SEN: 'SN', SRB: 'RS', SYC: 'SC', SLE: 'SL', SGP: 'SG', SVK: 'SK',
  SVN: 'SI', SLB: 'SB', SOM: 'SO', ZAF: 'ZA', SSD: 'SS', ESP: 'ES', LKA: 'LK',
  SDN: 'SD', SUR: 'SR', SWE: 'SE', CHE: 'CH', SYR: 'SY', TWN: 'TW', TJK: 'TJ',
  TZA: 'TZ', THA: 'TH', TLS: 'TL', TGO: 'TG', TON: 'TO', TTO: 'TT', TUN: 'TN',
  TUR: 'TR', TKM: 'TM', TUV: 'TV', UGA: 'UG', UKR: 'UA', ARE: 'AE', GBR: 'GB',
  USA: 'US', URY: 'UY', UZB: 'UZ', VUT: 'VU', VEN: 'VE', VNM: 'VN', YEM: 'YE',
  ZMB: 'ZM', ZWE: 'ZW',
}

interface CountryRow {
  code: string
  name: string
  lat: number
  lng: number
}

interface IndicatorRow {
  country_code: string
  indicator: string
  year: number
  value: number
}

async function fetchCsv(url: string): Promise<string> {
  console.log(`[owid] fetching ${url}`)
  const res = await fetch(url, {
    headers: { 'user-agent': 'vizmaya-iea-importer/1.0 (+https://vizmaya.fyi)' },
  })
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`)
  }
  const text = await res.text()
  console.log(`[owid] fetched ${(text.length / 1024 / 1024).toFixed(1)} MB`)
  return text
}

function parseNumber(s: string | undefined): number | null {
  if (s == null || s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

interface Parsed {
  countries: Map<string, CountryRow>
  indicators: IndicatorRow[]
}

function parseRows(csvText: string): Parsed {
  // OWID's full CSV is ~30 MB / ~30k rows — sync parse is fine in a one-off
  // import script and matches the pattern used by scripts/epstein/import-curated.ts.
  const rows = parseCsv(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]

  const countries = new Map<string, CountryRow>()
  const indicators: IndicatorRow[] = []
  const unmappedCodes = new Set<string>()
  const skippedNoCentroid = new Set<string>()

  for (const r of rows) {
    const iso3 = r.iso_code?.trim()
    if (!iso3) continue // aggregates ("World", "Europe", "OECD" …) have empty iso_code

    const code = ALPHA3_TO_ALPHA2[iso3]
    if (!code) {
      unmappedCodes.add(iso3)
      continue
    }

    const centroid = COUNTRY_CENTROIDS[code]
    if (!centroid) {
      skippedNoCentroid.add(code)
      continue
    }

    const year = Number(r.year)
    if (!Number.isFinite(year) || year < MIN_YEAR) continue

    if (!countries.has(code)) {
      countries.set(code, {
        code,
        name: centroid.name,
        lat: centroid.lat,
        lng: centroid.lng,
      })
    }

    for (const [csvCol, indicatorKey] of Object.entries(INDICATOR_MAP)) {
      const v = parseNumber(r[csvCol])
      if (v == null) continue
      indicators.push({
        country_code: code,
        indicator: indicatorKey,
        year,
        value: v,
      })
    }
  }

  if (unmappedCodes.size > 0) {
    console.warn(
      `[owid] ${unmappedCodes.size} OWID iso_codes have no alpha-2 mapping (skipped): ${[...unmappedCodes].slice(0, 10).join(', ')}${unmappedCodes.size > 10 ? ' …' : ''}`,
    )
  }
  if (skippedNoCentroid.size > 0) {
    console.warn(
      `[owid] ${skippedNoCentroid.size} codes mapped but no centroid in lib/iea/countryCentroids.ts (skipped): ${[...skippedNoCentroid].slice(0, 10).join(', ')}`,
    )
  }

  return { countries, indicators }
}

async function upsertCountries(rows: CountryRow[]): Promise<void> {
  const sb = createServiceClient()
  // Preserve any existing editorial summary by leaving that column out of the
  // upsert payload — Supabase only writes the columns we name.
  const batchSize = 200
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map((r) => ({
      code: r.code,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
    }))
    const { error } = await sb
      .from('iea_countries')
      .upsert(batch, { onConflict: 'code', ignoreDuplicates: false })
    if (error) throw new Error(`upsert iea_countries: ${error.message}`)
  }
}

async function upsertIndicators(rows: IndicatorRow[]): Promise<void> {
  const sb = createServiceClient()
  const batchSize = 1000
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await sb
      .from('iea_country_energy')
      .upsert(batch, { onConflict: 'country_code,indicator,year', ignoreDuplicates: false })
    if (error) throw new Error(`upsert iea_country_energy at offset ${i}: ${error.message}`)
    if (i % 10000 === 0) {
      console.log(`[owid] upserted ${Math.min(i + batchSize, rows.length)}/${rows.length} indicator rows`)
    }
  }
}

async function main(): Promise<void> {
  const csv = await fetchCsv(OWID_CSV_URL)
  const { countries, indicators } = parseRows(csv)
  console.log(
    `[owid] parsed: ${countries.size} countries, ${indicators.length} indicator rows`,
  )

  if (countries.size === 0) {
    throw new Error('OWID parse produced 0 countries — schema may have changed')
  }

  await upsertCountries([...countries.values()])
  console.log(`[owid] upserted ${countries.size} country rows`)

  await upsertIndicators(indicators)
  console.log(`[owid] upserted ${indicators.length} indicator rows`)
  console.log('[owid] done')
}

main().catch((err) => {
  console.error('[owid] failed:', err)
  process.exit(1)
})
