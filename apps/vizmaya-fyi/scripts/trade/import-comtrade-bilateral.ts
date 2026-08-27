/**
 * UN Comtrade bilateral importer — yearly reporter × partner flows at HS2
 * grain, scoped to pairs among the tracked reporter set, upserted into
 * trade_bilateral_flows (source='comtrade', migration 065).
 *
 * Feeds the /global-trade "trade web": country↔country edges where each
 * connection is one HS2 chapter and width is its volume. Both flow
 * directions are ingested (X and M) because reported exports and reported
 * imports of the same pair disagree in practice (CIF/FOB, timing), and the
 * viz offers each as its own lens.
 *
 * Call math: Comtrade accepts comma-joined reporterCode AND partnerCode, so
 * one call covers all 20×19 tracked pairs for one (year, flow) at AG2 —
 * ~37k records, under the 100k/call cap. Full 2001+ backfill ≈ 2 calls/year
 * ≈ 52 calls, trivially inside the 500/day budget.
 *
 * Run locally:
 *   pnpm trade:import-comtrade-bilateral                — incremental (last 3 years)
 *   pnpm trade:import-comtrade-bilateral -- --full      — backfill from 2001
 *   pnpm trade:import-comtrade-bilateral -- --dry-run   — fetch+parse, no writes
 *   pnpm trade:import-comtrade-bilateral -- --year=2024 --flow=export
 *
 * Required env: COMTRADE_API_KEY (keyless truncates at 500 records),
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for writes.
 *
 * Idempotency: upserts on the full PK
 * (reporter_code, partner_code, hs_code, year, flow, source).
 */

import { config as loadEnv } from 'dotenv'
import {
  classifyHsCode,
  upsertTradeBilateralFlows,
  upsertTradeCountries,
  upsertTradeProducts,
  type TradeBilateralRow,
  type TradeProductRow,
} from './db'
import { TRADE_MIN_YEAR, TRADE_REPORTERS } from './reporters'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const BASE_URL = 'https://comtradeapi.un.org/data/v1/get/C/A/HS'
const REQUEST_DELAY_MS = 1200

// Comtrade flow codes → the flow enum in trade_bilateral_flows.
const FLOWS = [
  { code: 'X', name: 'export' },
  { code: 'M', name: 'import' },
] as const
type FlowName = (typeof FLOWS)[number]['name']

interface Flags {
  dryRun: boolean
  full: boolean
  since?: number
  year?: number
  flow?: FlowName
}

function parseFlags(): Flags {
  const argv = process.argv.slice(2)
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const since = get('since')
  const year = get('year')
  const flow = get('flow')
  if (flow && flow !== 'export' && flow !== 'import') {
    throw new Error(`--flow=${flow} must be 'export' or 'import'`)
  }
  return {
    dryRun: argv.includes('--dry-run'),
    full: argv.includes('--full'),
    since: since ? Number(since) : undefined,
    year: year ? Number(year) : undefined,
    flow: flow as FlowName | undefined,
  }
}

interface ComtradeRecord {
  reporterCode: number
  partnerCode: number
  refYear: number
  cmdCode: string
  cmdDesc?: string
  flowCode: string
  primaryValue: number | null
}

async function fetchBilateral(year: number, flowCode: string): Promise<ComtradeRecord[]> {
  const allCodes = TRADE_REPORTERS.map((r) => r.comtradeCode).join(',')
  const params = new URLSearchParams({
    reporterCode: allCodes,
    partnerCode: allCodes,
    period: String(year),
    flowCode,
    partner2Code: '0',
    customsCode: 'C00',
    motCode: '0',
    cmdCode: 'AG2',
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
    console.warn('[comtrade-bilateral] 429 rate-limited — backing off 30s')
    await new Promise((r) => setTimeout(r, 30000))
    return fetchBilateral(year, flowCode)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `comtrade ${res.status} ${res.statusText} (year=${year}, flow=${flowCode}): ${body.slice(0, 300)}`,
    )
  }
  const payload = (await res.json()) as { data?: ComtradeRecord[]; error?: unknown }
  if (payload.error) {
    throw new Error(
      `comtrade error payload (year=${year}, flow=${flowCode}): ${JSON.stringify(payload.error).slice(0, 300)}`,
    )
  }
  const data = payload.data ?? []
  if (!process.env.COMTRADE_API_KEY && data.length === 500) {
    console.warn('[comtrade-bilateral] truncated at the 500-record keyless cap — set COMTRADE_API_KEY for full data')
  }
  if (data.length >= 100000) {
    // The whole point of the one-call-per-(year,flow) shape is staying under
    // the cap; hitting it means silent data loss, so fail loudly.
    throw new Error(`comtrade response hit the 100k-record cap (year=${year}, flow=${flowCode}) — split the call`)
  }
  return data
}

async function main(): Promise<void> {
  const flags = parseFlags()
  if (!process.env.COMTRADE_API_KEY && !flags.dryRun) {
    throw new Error(
      'COMTRADE_API_KEY is not set. Keyless calls truncate at 500 records (fine for --dry-run only).',
    )
  }

  const isoByM49 = new Map(TRADE_REPORTERS.map((r) => [Number(r.comtradeCode), r.code]))

  const currentYear = new Date().getFullYear()
  const sinceYear = flags.year ?? flags.since ?? (flags.full ? TRADE_MIN_YEAR : currentYear - 2)
  const untilYear = flags.year ?? currentYear
  const years: number[] = []
  for (let y = sinceYear; y <= untilYear; y++) years.push(y)
  const flows = FLOWS.filter((f) => !flags.flow || f.name === flags.flow)

  console.log(
    `[comtrade-bilateral] years=${sinceYear}–${untilYear} flows=${flows.map((f) => f.name).join(',')}` +
      ` pairs=${TRADE_REPORTERS.length}×${TRADE_REPORTERS.length - 1} (~${years.length * flows.length} calls)` +
      `${flags.dryRun ? ' (dry-run)' : ''}`,
  )

  const rows: TradeBilateralRow[] = []
  const products = new Map<string, TradeProductRow>()
  const skippedCodes = new Set<string>()

  for (const year of years) {
    for (const flow of flows) {
      const records = await fetchBilateral(year, flow.code)
      let kept = 0
      for (const rec of records) {
        const reporter = isoByM49.get(Number(rec.reporterCode))
        const partner = isoByM49.get(Number(rec.partnerCode))
        // Self-pairs shouldn't occur, but Comtrade has oddities; drop them.
        if (!reporter || !partner || reporter === partner) continue
        const classified = classifyHsCode(rec.cmdCode)
        if (!classified) {
          skippedCodes.add(rec.cmdCode)
          continue
        }
        const value = Number(rec.primaryValue)
        if (!Number.isFinite(value)) continue

        if (!products.has(classified.hs_code)) {
          products.set(classified.hs_code, {
            ...classified,
            name: rec.cmdDesc?.trim() || classified.hs_code,
          })
        }
        rows.push({
          reporter_code: reporter,
          partner_code: partner,
          hs_code: classified.hs_code,
          year: Number(rec.refYear),
          flow: flow.name,
          value_usd: value,
          source: 'comtrade',
        })
        kept++
      }
      console.log(`[comtrade-bilateral] ${year} ${flow.name}: ${kept} rows`)
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
    }
  }

  if (skippedCodes.size > 0) {
    console.warn(
      `[comtrade-bilateral] skipped ${skippedCodes.size} non-HS cmdCodes: ${[...skippedCodes].slice(0, 10).join(', ')}${skippedCodes.size > 10 ? ' …' : ''}`,
    )
  }
  console.log(`[comtrade-bilateral] parsed total: ${rows.length} bilateral rows`)
  if (rows.length === 0) {
    throw new Error('parsed 0 bilateral rows — API params or response shape may have changed')
  }

  if (flags.dryRun) {
    console.log('[comtrade-bilateral] dry-run sample:', JSON.stringify(rows.slice(0, 5), null, 2))
    console.log('[comtrade-bilateral] dry-run — no writes')
    return
  }

  await upsertTradeCountries(
    TRADE_REPORTERS.map((r) => ({ code: r.code, name: r.name })),
    'comtrade-bilateral',
  )
  await upsertTradeProducts([...products.values()], 'comtrade-bilateral')
  await upsertTradeBilateralFlows(rows, 'comtrade-bilateral')
  console.log(`[comtrade-bilateral] done — upserted ${rows.length} bilateral rows`)
}

main().catch((err) => {
  console.error('[comtrade-bilateral] failed:', err)
  process.exit(1)
})
