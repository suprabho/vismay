/**
 * ITC TradeMap manual-export importer — reads CSVs exported by hand from the
 * TradeMap time-series view (world exports by product, yearly) and upserts
 * them into trade_product_exports with source='trademap'.
 *
 * TradeMap has no public API and no bulk download, and scraping it is both
 * bot-blocked and against its terms of use — so this importer only ever
 * consumes files a human exported through the site's own Excel button (the
 * same posture as import-iea-oil-prices.ts). For automated refresh of the
 * equivalent data, use import-comtrade.ts (TradeMap is built on UN Comtrade).
 *
 * Workflow:
 *   1. Open https://beta.trademap.org/en/goods/time-series/exports/c/000/c/000/p/ALL/byProduct
 *      (world reporter, all products, yearly exports; free login may be
 *      required during the beta). Values are in USD thousands.
 *   2. Export to Excel — the table pages at ~300 rows, so export each page —
 *      and save each sheet as CSV under
 *      scripts/trade/data/trademap-world-exports-*.csv
 *   3. Run `pnpm trade:import-trademap` (add `-- --dry-run` to preview)
 *
 * Expected CSV layout: a product-code column, a product-label column, then
 * one column per year (header containing the 4-digit year, e.g. "Exported
 * value in 2021"). The parser detects columns from headers, so cosmetic
 * header changes between TradeMap versions are tolerated.
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotency: upserts on (reporter_code, hs_code, year, source). The
 * aggregate 'TOTAL' row is skipped — totals are derived by summing HS2 rows
 * in the reader, keeping the fact table purely per-product.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'
import { config as loadEnv } from 'dotenv'
import {
  classifyHsCode,
  upsertTradeCountries,
  upsertTradeExports,
  upsertTradeProducts,
  type TradeExportRow,
  type TradeProductRow,
} from './db'
import { TRADE_MIN_YEAR, WORLD_REPORTER } from './reporters'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const DATA_DIR = path.join(process.cwd(), 'scripts/trade/data')
const FILE_PREFIX = 'trademap-world-exports'
// TradeMap publishes values in USD thousands.
const UNIT_MULTIPLIER = 1000

const dryRun = process.argv.includes('--dry-run')

interface Parsed {
  exports: TradeExportRow[]
  products: Map<string, TradeProductRow>
  skipped: Set<string>
}

function parseFile(csvText: string, fileName: string, parsed: Parsed): void {
  const rows = parseCsv(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[]

  if (rows.length === 0) return
  const headers = Object.keys(rows[0])

  const codeCol = headers.find((h) => /code/i.test(h))
  const labelCol = headers.find((h) => /label|product/i.test(h) && h !== codeCol)
  const yearCols = headers
    .map((h) => ({ header: h, year: Number(h.match(/(?:19|20)\d{2}/)?.[0]) }))
    .filter((c): c is { header: string; year: number } => Number.isFinite(c.year))

  if (!codeCol || yearCols.length === 0) {
    throw new Error(
      `${fileName}: could not detect product-code column and year columns from headers: ${headers.join(' | ')}`,
    )
  }

  for (const r of rows) {
    const rawCode = (r[codeCol] ?? '').replace(/'/g, '').trim()
    const classified = classifyHsCode(rawCode)
    if (!classified) {
      if (rawCode) parsed.skipped.add(rawCode) // 'TOTAL' lands here by design
      continue
    }

    if (!parsed.products.has(classified.hs_code)) {
      const label = labelCol ? (r[labelCol] ?? '').trim() : ''
      parsed.products.set(classified.hs_code, {
        ...classified,
        name: label || classified.hs_code,
      })
    }

    for (const { header, year } of yearCols) {
      if (year < TRADE_MIN_YEAR) continue
      const value = Number((r[header] ?? '').replace(/[\s,]/g, ''))
      if (!Number.isFinite(value)) continue
      parsed.exports.push({
        reporter_code: WORLD_REPORTER.code,
        hs_code: classified.hs_code,
        year,
        value_usd: value * UNIT_MULTIPLIER,
        source: 'trademap',
      })
    }
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`data dir not found: ${DATA_DIR} — see the export workflow in this file's header`)
  }
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith('.csv'))
    .sort()
  if (files.length === 0) {
    throw new Error(
      `no ${FILE_PREFIX}-*.csv files in ${DATA_DIR}. Export them from TradeMap first (see header comment).`,
    )
  }

  const parsed: Parsed = { exports: [], products: new Map(), skipped: new Set() }
  for (const file of files) {
    const before = parsed.exports.length
    parseFile(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'), file, parsed)
    console.log(`[trademap] ${file}: ${parsed.exports.length - before} value rows`)
  }

  if (parsed.skipped.size > 0) {
    console.warn(
      `[trademap] skipped ${parsed.skipped.size} non-HS product codes (TOTAL etc.): ` +
        `${[...parsed.skipped].slice(0, 10).join(', ')}${parsed.skipped.size > 10 ? ' …' : ''}`,
    )
  }
  console.log(`[trademap] parsed total: ${parsed.exports.length} rows, ${parsed.products.size} products`)
  if (parsed.exports.length === 0) {
    throw new Error('parsed 0 rows — the TradeMap export layout may have changed')
  }

  if (dryRun) {
    console.log('[trademap] dry-run sample:', JSON.stringify(parsed.exports.slice(0, 5), null, 2))
    console.log('[trademap] dry-run — no writes')
    return
  }

  await upsertTradeCountries([{ code: WORLD_REPORTER.code, name: WORLD_REPORTER.name }], 'trademap')
  await upsertTradeProducts([...parsed.products.values()], 'trademap')
  await upsertTradeExports(parsed.exports, 'trademap')
  console.log(`[trademap] done — upserted ${parsed.exports.length} rows`)
}

main().catch((err) => {
  console.error('[trademap] failed:', err)
  process.exit(1)
})
