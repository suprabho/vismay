/**
 * IEA monthly oil-prices importer — reads the CSV exported from the IEA's
 * "Monthly Oil Prices Excerpt" xlsx (Contents / Coverage / raw data sheets)
 * and writes per-country/month rows into iea_oil_prices_monthly.
 *
 * The IEA refreshes the excerpt monthly (around the 7th–12th of each month
 * for the previous month). Workflow:
 *   1. Download the xlsx from iea.org/data-and-statistics/data-product/monthly-oil-price-statistics-2
 *   2. Open the `raw data` sheet and save-as CSV to
 *      scripts/energy-profile/data/iea-oil-prices-monthly.csv
 *   3. Run `pnpm energy-profile:import-iea-oil-prices`
 *
 * The CSV layout (header row included): COUNTRY, PRODUCT, FLOW, UNIT, TIME, VALUE
 *
 * Idempotency: upserts on (country_code, product, currency, month). Re-runs
 * only touch rows that changed.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '../../lib/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const CSV_PATH = path.join(
  process.cwd(),
  'scripts/energy-profile/data/iea-oil-prices-monthly.csv',
)

// IEA "COUNTRY" labels → ISO 3166-1 alpha-2. Covers the 33 countries
// currently in the monthly excerpt. The set is stable — when IEA adds a
// country it'll show up here as a skipped warning.
const COUNTRY_TO_CODE: Record<string, string> = {
  Austria: 'AT', Belgium: 'BE', Brazil: 'BR', Bulgaria: 'BG', Canada: 'CA',
  Croatia: 'HR', Cyprus: 'CY', 'Czech Republic': 'CZ', Denmark: 'DK',
  Estonia: 'EE', Finland: 'FI', France: 'FR', Germany: 'DE', Greece: 'GR',
  Hungary: 'HU', India: 'IN', Ireland: 'IE', Italy: 'IT', Japan: 'JP',
  Latvia: 'LV', Lithuania: 'LT', Luxembourg: 'LU', Malta: 'MT',
  Netherlands: 'NL', Poland: 'PL', Portugal: 'PT', Romania: 'RO',
  'Slovak Republic': 'SK', Slovenia: 'SI', Spain: 'ES', Sweden: 'SE',
  'United Kingdom': 'GB', 'United States': 'US',
}

// IEA "PRODUCT" labels → short key.
const PRODUCT_TO_KEY: Record<string, string> = {
  'Gasoline (unit/Litre)': 'gasoline',
  'Automotive diesel (unit/Litre)': 'diesel',
  'Light fuel oil (unit/1000 litres)': 'light_fuel_oil',
}

// IEA "UNIT" labels → short key.
const UNIT_TO_CURRENCY: Record<string, string> = {
  'USD': 'USD',
  'National currency': 'national',
}

interface PriceRow {
  country_code: string
  product: string
  currency: string
  month: string  // YYYY-MM-01
  value: number
}

function parseDate(raw: string): string | null {
  // CSV out of Excel can give us either ISO YYYY-MM-DD or M/D/YYYY.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-01`
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) {
    const month = us[1].padStart(2, '0')
    return `${us[3]}-${month}-01`
  }
  return null
}

function parseRows(csvText: string): PriceRow[] {
  const rows = parseCsv(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]

  const out: PriceRow[] = []
  const skippedCountries = new Set<string>()
  const skippedProducts = new Set<string>()

  for (const r of rows) {
    const country = r.country ?? r.COUNTRY
    const product = r.product ?? r.PRODUCT
    const unit = r.unit ?? r.UNIT
    const time = r.time ?? r.TIME
    const valueRaw = r.value ?? r.VALUE

    const code = COUNTRY_TO_CODE[country]
    if (!code) { skippedCountries.add(country); continue }

    const productKey = PRODUCT_TO_KEY[product]
    if (!productKey) { skippedProducts.add(product); continue }

    const currency = UNIT_TO_CURRENCY[unit]
    if (!currency) continue

    const month = parseDate(time)
    if (!month) continue

    const value = Number(valueRaw)
    if (!Number.isFinite(value)) continue

    out.push({ country_code: code, product: productKey, currency, month, value })
  }

  if (skippedCountries.size > 0) {
    console.warn(
      `[iea-oil] skipped ${skippedCountries.size} unknown country labels: ${[...skippedCountries].join(', ')}`,
    )
  }
  if (skippedProducts.size > 0) {
    console.warn(
      `[iea-oil] skipped ${skippedProducts.size} unknown product labels: ${[...skippedProducts].join(', ')}`,
    )
  }
  return out
}

async function upsert(rows: PriceRow[]): Promise<void> {
  const sb = createServiceClient()
  const batchSize = 1000
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await sb
      .from('iea_oil_prices_monthly')
      .upsert(batch, {
        onConflict: 'country_code,product,currency,month',
        ignoreDuplicates: false,
      })
    if (error) throw new Error(`upsert at offset ${i}: ${error.message}`)
    if (i % 5000 === 0) {
      console.log(`[iea-oil] upserted ${Math.min(i + batchSize, rows.length)}/${rows.length}`)
    }
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(
      `CSV not found at ${CSV_PATH}. Export the IEA xlsx 'raw data' sheet to CSV at this path.`,
    )
  }
  console.log(`[iea-oil] reading ${CSV_PATH}`)
  const csvText = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parseRows(csvText)
  console.log(`[iea-oil] parsed ${rows.length} price rows`)
  if (rows.length === 0) throw new Error('parsed 0 rows — CSV schema may have changed')

  await upsert(rows)
  console.log(`[iea-oil] done — upserted ${rows.length} rows`)
}

main().catch((err) => {
  console.error('[iea-oil] failed:', err)
  process.exit(1)
})
