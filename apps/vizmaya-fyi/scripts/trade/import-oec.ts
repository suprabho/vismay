/**
 * OEC BotMarket importer — pulls yearly exports-by-product rows for the
 * world's top reporters from a BotMarket trade dataset and upserts them into
 * trade_product_exports with source='oec'.
 *
 * BotMarket is a keyed JSON API (free tier: every query free, capped at
 * 1,000 rows per request, response reports the remaining balance). Because
 * ~1,260 HS4 headings exist per reporter-year, each (reporter, year) slice
 * is fetched with offset pagination.
 *
 * IMPORTANT — run discovery first. The dataset slug and column names below
 * are provisional until `pnpm trade:discover-oec` has been run against a
 * live key and the real schema recorded in
 * vizmaya-data/global-trade/INGEST_NOTES.md. The importer hard-fails with
 * actionable messages when the response shape doesn't match.
 *
 * Run locally:
 *   pnpm trade:import-oec                         — incremental (last 3 years)
 *   pnpm trade:import-oec -- --full               — backfill from 2001
 *   pnpm trade:import-oec -- --dry-run            — fetch+parse, no writes
 *   pnpm trade:import-oec -- --reporter=CN        — single reporter
 *   pnpm trade:import-oec -- --since=2015         — explicit year floor
 *
 * Required env:
 *   OEC_BOTMARKET_API_KEY       — Bearer key (claim: POST /api/promo/claim)
 *   OEC_TRADE_DATASET_SLUG      — dataset slug found via trade:discover-oec
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — write access
 * Optional env:
 *   OEC_TRADE_EXTRA_FILTERS     — extra querystring filters appended to every
 *                                 /query call (e.g. 'flow=export&depth=HS4'),
 *                                 for whatever the discovered schema needs
 *
 * Idempotency: upserts on (reporter_code, hs_code, year, source) — see
 * scripts/trade/db.ts.
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

const BASE_URL = 'https://botmarket.oec.world'
const PAGE_SIZE = 1000
const REQUEST_DELAY_MS = 150

// Column names in the /query response — provisional guesses in the OEC's
// usual vocabulary. Confirm against trade:discover-oec output and update
// here (plus INGEST_NOTES.md) before the first real import.
const COLS = {
  /** Reporter country, ISO alpha-3 lowercased in most OEC datasets. */
  reporter: process.env.OEC_TRADE_COL_REPORTER ?? 'country_iso3',
  /** HS product code (digits, level implied by length). */
  product: process.env.OEC_TRADE_COL_PRODUCT ?? 'hs4',
  /** Optional human-readable product name column. */
  productName: process.env.OEC_TRADE_COL_PRODUCT_NAME ?? 'hs4_name',
  year: process.env.OEC_TRADE_COL_YEAR ?? 'year',
  /** Export value in USD. */
  value: process.env.OEC_TRADE_COL_VALUE ?? 'trade_value',
}

interface Flags {
  dryRun: boolean
  full: boolean
  reporter?: string
  since?: number
  maxRequests: number
}

function parseFlags(): Flags {
  const argv = process.argv.slice(2)
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const since = get('since')
  const maxRequests = get('max-requests')
  return {
    dryRun: argv.includes('--dry-run'),
    full: argv.includes('--full'),
    reporter: get('reporter')?.toUpperCase(),
    since: since ? Number(since) : undefined,
    maxRequests: maxRequests ? Number(maxRequests) : 1500,
  }
}

let requestCount = 0

async function queryPage(
  slug: string,
  params: URLSearchParams,
  maxRequests: number,
): Promise<Record<string, unknown>[]> {
  if (requestCount >= maxRequests) {
    throw new Error(
      `hit --max-requests safety valve (${maxRequests}) — raise it explicitly if this is intended`,
    )
  }
  requestCount++

  const url = `${BASE_URL}/api/datasets/${slug}/query?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${process.env.OEC_BOTMARKET_API_KEY}`,
      'user-agent': 'vizmaya-trade-importer/1.0 (+https://vizmaya.fyi)',
    },
  })

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `query ${res.status}: check OEC_BOTMARKET_API_KEY (claim one via POST ${BASE_URL}/api/promo/claim). ` +
        'If the key is valid, the network may be Cloudflare-blocked — run via the GitHub Actions workflow instead.',
    )
  }
  if (res.status === 429 || res.status >= 500) {
    // One retry with backoff is enough at this request rate; persistent
    // failures should surface, not loop.
    console.warn(`[oec] ${res.status} on ${url} — retrying in 5s`)
    await new Promise((r) => setTimeout(r, 5000))
    return queryPage(slug, params, maxRequests)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`query ${res.status} ${res.statusText}: ${body.slice(0, 300)}`)
  }

  const payload = (await res.json()) as Record<string, unknown>
  // Free-tier responses include the remaining balance — keep it visible so
  // quota surprises show up in CI logs.
  const balance = payload.balance ?? payload.remaining_balance ?? payload.credits
  if (balance != null && requestCount % 25 === 1) {
    console.log(`[oec] remaining balance: ${JSON.stringify(balance)}`)
  }

  const rows = Array.isArray(payload) ? payload : payload.data ?? payload.rows ?? payload.results
  if (!Array.isArray(rows)) {
    throw new Error(
      `unexpected /query response shape (no data/rows/results array). Keys: ${Object.keys(payload).join(', ')}. ` +
        'Re-run trade:discover-oec and update the parsing in import-oec.ts.',
    )
  }
  return rows as Record<string, unknown>[]
}

/** Fetch one (reporter, year) slice, paging past the 1,000-row cap. */
async function fetchSlice(
  slug: string,
  iso3: string,
  year: number,
  flags: Flags,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      [COLS.reporter]: iso3.toLowerCase(),
      [COLS.year]: String(year),
      limit: String(PAGE_SIZE),
      offset: String(offset),
    })
    for (const [k, v] of new URLSearchParams(process.env.OEC_TRADE_EXTRA_FILTERS ?? '')) {
      params.set(k, v)
    }
    const batch = await queryPage(slug, params, flags.maxRequests)

    // Guard against servers that ignore `offset`: identical first row on the
    // second page means we're looping, not paging.
    if (offset > 0 && batch.length > 0 && all.length > 0 &&
        JSON.stringify(batch[0]) === JSON.stringify(all[0])) {
      throw new Error(
        `offset pagination appears unsupported for ${slug} (page 2 repeats page 1). ` +
          'Sub-slice via OEC_TRADE_EXTRA_FILTERS (e.g. per-HS2 chapter filters) instead.',
      )
    }

    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
  }
  return all
}

interface Parsed {
  exports: TradeExportRow[]
  products: Map<string, TradeProductRow>
  skippedProducts: Set<string>
}

function parseRows(
  raw: Record<string, unknown>[],
  reporterCode: string,
  parsed: Parsed,
): void {
  for (const r of raw) {
    const productRaw = String(r[COLS.product] ?? '')
    const classified = classifyHsCode(productRaw)
    if (!classified) {
      if (productRaw) parsed.skippedProducts.add(productRaw)
      continue
    }

    const year = Number(r[COLS.year])
    const value = Number(r[COLS.value])
    if (!Number.isFinite(year) || !Number.isFinite(value)) continue

    if (!parsed.products.has(classified.hs_code)) {
      const name = typeof r[COLS.productName] === 'string' && r[COLS.productName]
        ? String(r[COLS.productName])
        : classified.hs_code
      parsed.products.set(classified.hs_code, { ...classified, name })
    }

    parsed.exports.push({
      reporter_code: reporterCode,
      hs_code: classified.hs_code,
      year,
      value_usd: value,
      source: 'oec',
    })
  }
}

async function main(): Promise<void> {
  const flags = parseFlags()

  if (!process.env.OEC_BOTMARKET_API_KEY) {
    throw new Error('OEC_BOTMARKET_API_KEY is not set — claim a free key via POST https://botmarket.oec.world/api/promo/claim')
  }
  const slug = process.env.OEC_TRADE_DATASET_SLUG
  if (!slug) {
    throw new Error(
      'OEC_TRADE_DATASET_SLUG is not set. Run `pnpm trade:discover-oec` to find the ' +
        'international-trade dataset slug, record it in vizmaya-data/global-trade/INGEST_NOTES.md, then set the env var.',
    )
  }

  const currentYear = new Date().getFullYear()
  // Trade data for year N firms up during N+1, so incremental runs re-pull a
  // 3-year tail; --full backfills from the TradeMap-era floor.
  const sinceYear = flags.since ?? (flags.full ? TRADE_MIN_YEAR : currentYear - 2)
  const years: number[] = []
  for (let y = sinceYear; y <= currentYear; y++) years.push(y)

  const reporters = flags.reporter
    ? TRADE_REPORTERS.filter((r) => r.code === flags.reporter)
    : TRADE_REPORTERS
  if (reporters.length === 0) {
    throw new Error(`--reporter=${flags.reporter} is not in the allowlist (scripts/trade/reporters.ts)`)
  }

  console.log(
    `[oec] dataset=${slug} reporters=${reporters.length} years=${sinceYear}–${currentYear}` +
      `${flags.dryRun ? ' (dry-run)' : ''}`,
  )

  const parsed: Parsed = { exports: [], products: new Map(), skippedProducts: new Set() }

  for (const reporter of reporters) {
    for (const year of years) {
      const raw = await fetchSlice(slug, reporter.iso3, year, flags)
      const before = parsed.exports.length
      parseRows(raw, reporter.code, parsed)
      console.log(
        `[oec] ${reporter.code} ${year}: ${raw.length} rows fetched, ${parsed.exports.length - before} parsed`,
      )
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
    }
  }

  if (parsed.skippedProducts.size > 0) {
    console.warn(
      `[oec] skipped ${parsed.skippedProducts.size} non-HS product values: ` +
        `${[...parsed.skippedProducts].slice(0, 10).join(', ')}${parsed.skippedProducts.size > 10 ? ' …' : ''}`,
    )
  }
  console.log(
    `[oec] parsed total: ${parsed.exports.length} export rows, ${parsed.products.size} products, ${requestCount} API requests`,
  )
  if (parsed.exports.length === 0) {
    throw new Error('parsed 0 export rows — column mapping (COLS) likely does not match the dataset schema')
  }

  if (flags.dryRun) {
    console.log('[oec] dry-run sample:', JSON.stringify(parsed.exports.slice(0, 5), null, 2))
    console.log('[oec] dry-run — no writes')
    return
  }

  await upsertTradeCountries(
    reporters.map((r) => ({ code: r.code, name: r.name })),
    'oec',
  )
  await upsertTradeProducts([...parsed.products.values()], 'oec')
  await upsertTradeExports(parsed.exports, 'oec')
  console.log(`[oec] done — upserted ${parsed.exports.length} export rows`)
}

main().catch((err) => {
  console.error('[oec] failed:', err)
  process.exit(1)
})
