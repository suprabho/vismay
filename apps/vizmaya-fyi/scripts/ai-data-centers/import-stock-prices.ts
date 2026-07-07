/**
 * AI Data Centers stock price importer — populates dc_stock_prices with daily
 * OHLCV bars for the US tickers (market='US') from massive.com's market-data
 * REST API (a keyed, licensed, Polygon-compatible aggregates endpoint).
 *
 * The international tickers (TW/KR/JP/NL/HK) are NOT fetched here: massive.com
 * is US-only, and every free API that covers those exchanges is either
 * plan-gated (Twelve Data, Alpha Vantage) or bot-gates CI's datacenter IPs
 * (Stooq, Yahoo). They're hand-uploaded instead through the admin Pipeline tab
 * (/vizmaya/pipeline → AI Data Centers → "International prices — Stooq upload"),
 * which parses a browser-downloaded Stooq CSV and upserts the same rows via
 * parseStooqCsv + upsertDcStockPrices in @vismay/content-source/epics.
 *
 * Upsert is idempotent on (ticker, trade_date); prices stay in the listing's
 * native currency; close is split-adjusted.
 *
 * Run locally:  pnpm ai-data-centers:import-stocks
 *               pnpm ai-data-centers:import-stocks -- --full          # ~5y backfill
 *               pnpm ai-data-centers:import-stocks -- --days 90
 *               pnpm ai-data-centers:import-stocks -- --ticker NVDA --dry-run
 * Run in CI:    .github/workflows/import-dc-stock-prices.yml (weekday cron)
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *   MASSIVE_API_TOKEN — massive.com REST API key (US tickers).
 *
 * Idempotency: upsert on (ticker, trade_date). massive.com daily timestamps are
 * converted to trade dates in US/Eastern. A bar written mid-session is partial
 * but self-heals on the next run.
 */

import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const MASSIVE_API_BASE = 'https://api.massive.com'
const MASSIVE_KEY = process.env.MASSIVE_API_TOKEN?.trim() || null
// massive.com/Polygon daily aggregate timestamps are Eastern-Time day starts.
const US_TZ = 'America/New_York'
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const DEFAULT_LOOKBACK_DAYS = 45 // daily incremental — generous overlap, upsert dedupes
const FULL_LOOKBACK_DAYS = 5 * 365 + 30 // ~5y backfill
const UPSERT_BATCH = 500
const REQUEST_DELAY_MS = 400
const REQUEST_JITTER_MS = 300 // uniform spacing looks like a bot — smear it
const FETCH_TIMEOUT_MS = 20_000
// massive.com's free tier throttles to a few calls/minute, so a ticker can get
// caught mid-window; retry enough times to ride out a full cooldown cycle.
const MAX_ATTEMPTS = 5
// massive.com's free tier rate-limits; a 429 pauses the whole run (Retry-After
// aware) so we glide under the cap rather than hammering it.
const RATE_LIMIT_BASE_MS = 15_000
const RATE_LIMIT_MAX_MS = 60_000

interface Args {
  lookbackDays: number
  dryRun: boolean
  ticker: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { lookbackDays: DEFAULT_LOOKBACK_DAYS, dryRun: false, ticker: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    // pnpm forwards the `--` separator itself (npm strips it), so a bare
    // `pnpm ai-data-centers:import-stocks -- --full` delivers ['--', '--full'].
    if (a === '--') continue
    else if (a === '--full') args.lookbackDays = FULL_LOOKBACK_DAYS
    else if (a === '--days') args.lookbackDays = Number(argv[++i]) || DEFAULT_LOOKBACK_DAYS
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--ticker') args.ticker = argv[++i] ?? null
    else throw new Error(`Unknown flag: ${a}`)
  }
  return args
}

interface Stock {
  ticker: string
  name: string
  market: string
}

interface PriceRow {
  ticker: string
  trade_date: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** YYYY-MM-DD (UTC) — used for the request window bounds. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dateWindow(lookbackDays: number): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getTime() - lookbackDays * 86_400_000)
  return { from: isoDate(from), to: isoDate(now) }
}

/** Collapse duplicate dates to the last bar, sorted ascending. */
function dedupeByDate(rows: PriceRow[]): PriceRow[] {
  const byDate = new Map<string, PriceRow>()
  for (const row of rows) byDate.set(row.trade_date, row)
  return [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date))
}

/**
 * massive.com rate-limits per IP, so every request funnels through one shared
 * gate: a 429 escalates a run-wide cooldown (honouring Retry-After), a success
 * resets it. Also retries transient network errors and 5xx.
 */
const limiter = {
  waitUntil: 0,
  cooldownMs: 0,
  async gate() {
    const wait = this.waitUntil - Date.now()
    if (wait > 0) await sleep(wait)
  },
  hit(retryAfter: number) {
    this.cooldownMs = Math.min(
      Math.max(RATE_LIMIT_BASE_MS, this.cooldownMs * 2, retryAfter),
      RATE_LIMIT_MAX_MS
    )
    this.waitUntil = Math.max(this.waitUntil, Date.now() + this.cooldownMs)
  },
  settle() {
    this.cooldownMs = 0
    this.waitUntil = 0
  },
}

function retryAfterMs(res: Response): number {
  const seconds = Number(res.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
}

async function getWithRetry(
  url: string,
  headers: Record<string, string>,
  label: string
): Promise<Response> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await limiter.gate()
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (res.status === 429) {
        limiter.hit(retryAfterMs(res))
        lastErr = new Error(`${label} 429 Too Many Requests`)
        continue // the next limiter.gate() waits out the cooldown
      }
      if (res.status >= 500) {
        lastErr = new Error(`${label} ${res.status} ${res.statusText}`)
        if (attempt < MAX_ATTEMPTS - 1) await sleep(1500 * 2 ** attempt + Math.random() * 500)
        continue
      }
      limiter.settle()
      return res
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (attempt < MAX_ATTEMPTS - 1) await sleep(1500 * 2 ** attempt + Math.random() * 500)
    }
  }
  throw lastErr ?? new Error(`${label}: fetch failed`)
}

interface MassiveBar {
  t: number // ms timestamp of the aggregate window start
  o?: number
  h?: number
  l?: number
  c?: number
  v?: number
}
interface MassiveResp {
  status?: string
  results?: MassiveBar[]
  error?: string
  message?: string
}

/** Daily bars for a US ticker from massive.com's Polygon-compatible aggregates API. */
async function fetchMassive(ticker: string, from: string, to: string): Promise<PriceRow[]> {
  if (!MASSIVE_KEY) throw new Error('MASSIVE_API_TOKEN not set — cannot fetch US tickers')
  const url =
    `${MASSIVE_API_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=50000`
  const res = await getWithRetry(
    url,
    { authorization: `Bearer ${MASSIVE_KEY}`, accept: 'application/json', 'user-agent': USER_AGENT },
    `massive ${ticker}`
  )
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 180).replace(/\s+/g, ' ').trim()
    throw new Error(`massive ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`)
  }
  const data = (await res.json()) as MassiveResp
  // Polygon returns status OK/DELAYED with results; anything else is an error.
  if (data.status && data.status !== 'OK' && data.status !== 'DELAYED') {
    throw new Error(`massive ${data.status}: ${data.error ?? data.message ?? 'error'}`)
  }
  const rows: PriceRow[] = []
  for (const b of data.results ?? []) {
    if (b.c == null) continue // a bar without a close is unusable
    rows.push({
      ticker,
      trade_date: new Date(b.t).toLocaleDateString('en-CA', { timeZone: US_TZ }),
      open: b.o ?? null,
      high: b.h ?? null,
      low: b.l ?? null,
      close: b.c,
      // massive.com returns split-adjusted volume, which is fractional; the
      // dc_stock_prices.volume column is bigint, so round to whole shares.
      volume: b.v == null ? null : Math.round(b.v),
    })
  }
  return dedupeByDate(rows)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sb = createServiceClient()

  let query = sb
    .from('dc_stocks')
    .select('ticker, name, market')
    .eq('is_active', true)
    .order('ticker')
  if (args.ticker) query = query.eq('ticker', args.ticker)
  const { data: stockRows, error: stocksErr } = await query
  if (stocksErr) throw new Error(`dc_stocks read failed: ${stocksErr.message}`)
  const stocks = (stockRows ?? []) as Stock[]
  if (stocks.length === 0) {
    throw new Error(
      args.ticker
        ? `No active dc_stocks row for ${args.ticker}`
        : 'dc_stocks is empty — apply migration 065 before importing'
    )
  }

  const { from, to } = dateWindow(args.lookbackDays)
  const usStocks = stocks.filter((s) => s.market === 'US')
  const intlStocks = stocks.filter((s) => s.market !== 'US')
  console.log(
    `Importing daily bars ${from} → ${to} for ${usStocks.length} US ticker(s) via massive.com` +
      (args.dryRun ? ' (dry run)' : '')
  )
  if (usStocks.length > 0 && !MASSIVE_KEY) {
    console.error('⚠ MASSIVE_API_TOKEN not set — the US tickers will fail until it is')
  }
  if (intlStocks.length > 0) {
    console.log(
      `Skipping ${intlStocks.length} international ticker(s) — hand-uploaded via the admin ` +
        `Pipeline tab: ${intlStocks.map((s) => s.ticker).join(', ')}`
    )
  }

  let totalRows = 0
  const failures: string[] = []

  for (const stock of usStocks) {
    try {
      const rows = await fetchMassive(stock.ticker, from, to)
      if (rows.length === 0) {
        failures.push(stock.ticker)
        console.error(`  ✗ ${stock.ticker} (${stock.name}): 0 bars in range`)
        continue
      }
      if (!args.dryRun) {
        for (let j = 0; j < rows.length; j += UPSERT_BATCH) {
          const batch = rows.slice(j, j + UPSERT_BATCH)
          const { error: upsertErr } = await sb
            .from('dc_stock_prices')
            .upsert(batch, { onConflict: 'ticker,trade_date' })
          if (upsertErr) throw new Error(`upsert: ${upsertErr.message}`)
        }
      }
      totalRows += rows.length
      console.log(
        `  ✓ ${stock.ticker} (${stock.name}): ${rows.length} bars ` +
          `${rows[0].trade_date} → ${rows[rows.length - 1].trade_date}`
      )
    } catch (err) {
      failures.push(stock.ticker)
      console.error(
        `  ✗ ${stock.ticker} (${stock.name}): ${err instanceof Error ? err.message : String(err)}`
      )
    }
    await sleep(REQUEST_DELAY_MS + Math.random() * REQUEST_JITTER_MS)
  }

  console.log(
    `\nDone. ${totalRows} bars across ${usStocks.length - failures.length}/${usStocks.length} US tickers.`
  )
  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(', ')}`)
    // Every US ticker failing means massive.com is down or misconfigured — paint
    // the run red. Partial failures stay green so one delisting doesn't mask the rest.
    if (usStocks.length > 0 && failures.length === usStocks.length) process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
