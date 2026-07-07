/**
 * AI Data Centers stock price importer — populates dc_stock_prices with daily
 * OHLCV bars for every active dc_stocks ticker, routed by home market:
 *
 *   • US tickers (market='US')          → massive.com market-data REST API, a
 *     keyed, licensed feed (Polygon-compatible aggregates endpoint).
 *   • International (TW/KR/JP/NL/HK)     → Stooq's free keyless daily CSV, the
 *     one no-key source spanning all five non-US exchanges massive.com doesn't
 *     cover (massive.com is US-only).
 *
 * Both normalise to the same (ticker, trade_date, o/h/l/c/v) rows and upsert
 * idempotently on (ticker, trade_date). Prices stay in the listing's native
 * currency; close is split-adjusted.
 *
 * Symbol mapping (Stooq): the dc_stocks `market` column (US|TW|KR|JP|NL|HK)
 * gives the Stooq suffix directly — note Korea is `.KS` in the ticker but `.kr`
 * on Stooq, so we key off `market`, never the ticker suffix.
 *
 * Run locally:  pnpm ai-data-centers:import-stocks
 *               pnpm ai-data-centers:import-stocks -- --full          # ~5y backfill
 *               pnpm ai-data-centers:import-stocks -- --days 90
 *               pnpm ai-data-centers:import-stocks -- --ticker NVDA --dry-run
 * Run in CI:    .github/workflows/import-dc-stock-prices.yml (weekday cron)
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *   MASSIVE_API_TOKEN — massive.com REST API key. Needed for the US tickers;
 *   the international tickers use Stooq, which needs no key.
 *
 * Idempotency: upsert on (ticker, trade_date). Trading days come from the
 * source in the exchange's own calendar — massive.com timestamps are converted
 * in US/Eastern; Stooq already dates each bar by its local trading day. A bar
 * written mid-session is partial but self-heals on the next run.
 */

import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const MASSIVE_API_BASE = 'https://api.massive.com'
const MASSIVE_KEY = process.env.MASSIVE_API_TOKEN?.trim() || null
const STOOQ_CSV_URL = 'https://stooq.com/q/d/l/'
// dc_stocks.market → Stooq exchange suffix. US never reaches Stooq.
const STOOQ_SUFFIX: Record<string, string> = { TW: 'tw', KR: 'kr', JP: 'jp', NL: 'nl', HK: 'hk' }
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

function numOrNull(s: string | undefined): number | null {
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Collapse duplicate dates to the last bar, sorted ascending. */
function dedupeByDate(rows: PriceRow[]): PriceRow[] {
  const byDate = new Map<string, PriceRow>()
  for (const row of rows) byDate.set(row.trade_date, row)
  return [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date))
}

/**
 * Both sources rate-limit per IP, so every request funnels through one shared
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

/** dc_stocks ticker + market → Stooq symbol, e.g. 005930.KS (KR) → 005930.kr. */
function stooqSymbol(ticker: string, market: string): string {
  const suffix = STOOQ_SUFFIX[market]
  if (!suffix) throw new Error(`no Stooq suffix for market ${market}`)
  return `${ticker.split('.')[0].toLowerCase()}.${suffix}`
}

/** Daily bars for an international ticker from Stooq's free CSV endpoint. */
async function fetchStooq(
  ticker: string,
  market: string,
  from: string,
  to: string
): Promise<PriceRow[]> {
  const sym = stooqSymbol(ticker, market)
  const url =
    `${STOOQ_CSV_URL}?s=${encodeURIComponent(sym)}&i=d` +
    `&d1=${from.replace(/-/g, '')}&d2=${to.replace(/-/g, '')}`
  const res = await getWithRetry(url, { 'user-agent': USER_AGENT }, `stooq ${sym}`)
  const body = await res.text()
  if (!res.ok) throw new Error(`stooq ${sym} ${res.status} ${res.statusText}`)
  // Stooq answers unknown symbols / throttling with a non-CSV body ("No data",
  // "Exceeded the daily hits limit", or an HTML page) at HTTP 200.
  if (!body.startsWith('Date,')) {
    throw new Error(`stooq ${sym}: ${body.slice(0, 120).replace(/\s+/g, ' ').trim() || 'empty response'}`)
  }
  const rows: PriceRow[] = []
  const lines = body.trim().split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    // Date,Open,High,Low,Close,Volume — no quoting, so a plain split is safe.
    const [date, open, high, low, close, volume] = lines[i].split(',')
    const c = Number(close)
    if (!date || !Number.isFinite(c)) continue // skip N/D / blank closes
    rows.push({
      ticker,
      trade_date: date, // Stooq already dates each bar by its local trading day
      open: numOrNull(open),
      high: numOrNull(high),
      low: numOrNull(low),
      close: c,
      volume: numOrNull(volume) == null ? null : Math.round(Number(volume)),
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
  const usCount = stocks.filter((s) => s.market === 'US').length
  console.log(
    `Importing daily bars ${from} → ${to} for ${stocks.length} ticker(s) ` +
      `(${usCount} US via massive.com, ${stocks.length - usCount} international via Stooq)` +
      (args.dryRun ? ' (dry run)' : '')
  )
  if (usCount > 0 && !MASSIVE_KEY) {
    console.error('⚠ MASSIVE_API_TOKEN not set — the US tickers will fail until it is')
  }

  let totalRows = 0
  const failures: string[] = []

  for (const stock of stocks) {
    try {
      const rows =
        stock.market === 'US'
          ? await fetchMassive(stock.ticker, from, to)
          : await fetchStooq(stock.ticker, stock.market, from, to)
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
    `\nDone. ${totalRows} bars across ${stocks.length - failures.length}/${stocks.length} tickers.`
  )
  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(', ')}`)
    // Every ticker failing means a source is down or misconfigured — paint the
    // run red. Partial failures stay green so one delisting doesn't mask the rest.
    if (failures.length === stocks.length) process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
