/**
 * UN Comtrade importer — pulls yearly goods exports by product (HS2 + HS4,
 * partner = World) for the top-reporter allowlist and upserts them into
 * trade_product_exports with source='comtrade'.
 *
 * Why Comtrade for the "TradeMap" source? ITC TradeMap has no public API and
 * no bulk download (and scraping it is both bot-blocked and against its
 * terms), but TradeMap's yearly series are built on UN Comtrade, which has a
 * free official API. The manual TradeMap Excel path still exists for curated
 * world-level views — see import-trademap.ts. The world-total-by-product
 * series ('WLD' reporter) comes from that manual path; this importer covers
 * the per-country reporters.
 *
 * API: GET https://comtradeapi.un.org/data/v1/get/C/A/HS
 *   C = commodities (goods), A = annual, HS = Harmonized System codes.
 *   cmdCode=AG2|AG4 (all codes at that digit level), flowCode=X (exports),
 *   partnerCode=0 (world partner), reporterCode = M49 numeric.
 * Free key: 500 calls/day, 100k records/call. Register at
 * comtradedeveloper.un.org (product "comtrade - v1"). Keyless calls are
 * capped at 500 records — enough for --dry-run smoke tests only.
 *
 * Run locally:
 *   pnpm trade:import-comtrade                    — incremental (last 3 years)
 *   pnpm trade:import-comtrade -- --full          — backfill from 2001
 *   pnpm trade:import-comtrade -- --dry-run       — fetch+parse, no writes
 *   pnpm trade:import-comtrade -- --reporter=CN --level=4
 *
 * Required env:
 *   COMTRADE_API_KEY — subscription key (strongly recommended; see above)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — write access
 *
 * Idempotency: upserts on (reporter_code, hs_code, year, source).
 */

import { config as loadEnv } from 'dotenv'
import {
  classifyHsCode,
  upsertTradeCountries,
  upsertTradeExports,
  upsertTradeProducts,
  type TradeExportRow,
  type TradeProductRow,
} from './db'
import { TRADE_MIN_YEAR, TRADE_REPORTERS } from './reporters'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const BASE_URL = 'https://comtradeapi.un.org/data/v1/get/C/A/HS'
// Comtrade accepts at most 12 comma-joined periods per call.
const YEARS_PER_CALL = 12
// Free-tier rate limit is 5 calls/sec; 1.2s spacing keeps runs polite and
// far inside the 500 calls/day budget (full backfill ≈ 120 calls).
const REQUEST_DELAY_MS = 1200

interface Flags {
  dryRun: boolean
  full: boolean
  reporter?: string
  since?: number
  levels: Array<2 | 4>
}

function parseFlags(): Flags {
  const argv = process.argv.slice(2)
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const since = get('since')
  const level = get('level')
  return {
    dryRun: argv.includes('--dry-run'),
    full: argv.includes('--full'),
    reporter: get('reporter')?.toUpperCase(),
    since: since ? Number(since) : undefined,
    levels: level ? [Number(level) as 2 | 4] : [2, 4],
  }
}

interface ComtradeRecord {
  reporterCode: number
  refYear: number
  cmdCode: string
  cmdDesc?: string
  flowCode: string
  partnerCode: number
  primaryValue: number | null
}

async function fetchComtrade(
  reporterCode: string,
  years: number[],
  level: 2 | 4,
): Promise<ComtradeRecord[]> {
  const params = new URLSearchParams({
    reporterCode,
    period: years.join(','),
    flowCode: 'X',
    partnerCode: '0',
    partner2Code: '0',
    customsCode: 'C00',
    motCode: '0',
    cmdCode: `AG${level}`,
    maxRecords: '100000',
    format: 'JSON',
    includeDesc: 'true',
  })
  const key = process.env.COMTRADE_API_KEY
  if (key) params.set('subscription-key', key)

  const res = await fetch(`${BASE_URL}?${params.toString()}`, {
    headers: {
      accept: 'application/json',
      'user-agent': 'vizmaya-trade-importer/1.0 (+https://vizmaya.fyi)',
    },
  })
  if (res.status === 429) {
    console.warn('[comtrade] 429 rate-limited — backing off 30s')
    await new Promise((r) => setTimeout(r, 30000))
    return fetchComtrade(reporterCode, years, level)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `comtrade ${res.status} ${res.statusText} (reporter=${reporterCode}, AG${level}): ${body.slice(0, 300)}`,
    )
  }
  const payload = (await res.json()) as { count?: number; data?: ComtradeRecord[]; error?: unknown }
  if (payload.error) {
    throw new Error(`comtrade error payload (reporter=${reporterCode}): ${JSON.stringify(payload.error).slice(0, 300)}`)
  }
  const data = payload.data ?? []
  // Keyless calls silently truncate to 500 records — that's data loss for a
  // real import, so refuse to write truncated slices.
  if (!process.env.COMTRADE_API_KEY && data.length === 500) {
    console.warn('[comtrade] response truncated at the 500-record keyless cap — set COMTRADE_API_KEY for full data')
  }
  return data
}

function chunkYears(since: number, until: number): number[][] {
  const all: number[] = []
  for (let y = since; y <= until; y++) all.push(y)
  const chunks: number[][] = []
  for (let i = 0; i < all.length; i += YEARS_PER_CALL) {
    chunks.push(all.slice(i, i + YEARS_PER_CALL))
  }
  return chunks
}

async function main(): Promise<void> {
  const flags = parseFlags()
  if (!process.env.COMTRADE_API_KEY && !flags.dryRun) {
    throw new Error(
      'COMTRADE_API_KEY is not set. Keyless calls truncate at 500 records (fine for --dry-run only). ' +
        'Register a free key at https://comtradedeveloper.un.org',
    )
  }

  const currentYear = new Date().getFullYear()
  const sinceYear = flags.since ?? (flags.full ? TRADE_MIN_YEAR : currentYear - 2)
  const yearChunks = chunkYears(sinceYear, currentYear)

  const reporters = flags.reporter
    ? TRADE_REPORTERS.filter((r) => r.code === flags.reporter)
    : TRADE_REPORTERS
  if (reporters.length === 0) {
    throw new Error(`--reporter=${flags.reporter} is not in the allowlist (scripts/trade/reporters.ts)`)
  }

  console.log(
    `[comtrade] reporters=${reporters.length} years=${sinceYear}–${currentYear} levels=${flags.levels.join(',')}` +
      ` (~${reporters.length * yearChunks.length * flags.levels.length} calls)${flags.dryRun ? ' (dry-run)' : ''}`,
  )

  const exports_: TradeExportRow[] = []
  const products = new Map<string, TradeProductRow>()
  const skippedCodes = new Set<string>()

  for (const reporter of reporters) {
    let reporterRows = 0
    for (const level of flags.levels) {
      for (const years of yearChunks) {
        const records = await fetchComtrade(reporter.comtradeCode, years, level)
        for (const rec of records) {
          const classified = classifyHsCode(rec.cmdCode)
          if (!classified) {
            skippedCodes.add(rec.cmdCode)
            continue
          }
          const year = Number(rec.refYear)
          const value = Number(rec.primaryValue)
          if (!Number.isFinite(year) || year < sinceYear || !Number.isFinite(value)) continue

          if (!products.has(classified.hs_code)) {
            products.set(classified.hs_code, {
              ...classified,
              name: rec.cmdDesc?.trim() || classified.hs_code,
            })
          }
          // Comtrade primaryValue is already plain USD — no unit conversion.
          exports_.push({
            reporter_code: reporter.code,
            hs_code: classified.hs_code,
            year,
            value_usd: value,
            source: 'comtrade',
          })
          reporterRows++
        }
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
      }
    }
    console.log(`[comtrade] ${reporter.code}: ${reporterRows} rows`)
  }

  if (skippedCodes.size > 0) {
    console.warn(
      `[comtrade] skipped ${skippedCodes.size} non-HS cmdCodes: ${[...skippedCodes].slice(0, 10).join(', ')}${skippedCodes.size > 10 ? ' …' : ''}`,
    )
  }
  console.log(`[comtrade] parsed total: ${exports_.length} export rows, ${products.size} products`)
  if (exports_.length === 0) {
    throw new Error('parsed 0 export rows — API params or response shape may have changed')
  }

  if (flags.dryRun) {
    console.log('[comtrade] dry-run sample:', JSON.stringify(exports_.slice(0, 5), null, 2))
    console.log('[comtrade] dry-run — no writes')
    return
  }

  await upsertTradeCountries(
    reporters.map((r) => ({ code: r.code, name: r.name })),
    'comtrade',
  )
  await upsertTradeProducts([...products.values()], 'comtrade')
  await upsertTradeExports(exports_, 'comtrade')
  console.log(`[comtrade] done — upserted ${exports_.length} export rows`)
}

main().catch((err) => {
  console.error('[comtrade] failed:', err)
  process.exit(1)
})
