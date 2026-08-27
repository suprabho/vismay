/**
 * AI Data Centers stock price importer — populates dc_stock_prices with daily
 * OHLCV bars for every tracked ticker, split by exchange:
 *
 *   • US tickers (market='US') ← massive.com's market-data REST API (a keyed,
 *     licensed, Polygon-compatible aggregates endpoint).
 *   • International tickers (TW/KR/JP/NL/HK) ← Yahoo Finance, scraped by an
 *     Apify actor (apify/dc-yahoo-stock-scraper) running on a residential proxy.
 *
 * Why the split: Yahoo blocks datacenter IPs, so CI (a datacenter IP) can't hit
 * it directly — that's what kept this cron failing. Apify runs the same fetch on
 * a residential IP and we pull the finished rows over its REST API. massive.com
 * covers only US listings, so it stays the US source. (The admin Pipeline tab's
 * Stooq upload — parseStooqCsv + upsertDcStockPrices — remains as a manual
 * fallback if Apify ever has an off day.)
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
 *   APIFY_TOKEN + APIFY_ACTOR_ID — Apify API token and the deployed
 *     dc-yahoo-stock-scraper actor id (international tickers). Missing ⇒ the
 *     international tickers are skipped with a note (US still imports).
 *
 * Idempotency: upsert on (ticker, trade_date). Daily timestamps are converted to
 * trade dates in the exchange's own timezone (US/Eastern for massive.com; the
 * exchange tz for Yahoo). A bar written mid-session is partial but self-heals on
 * the next run.
 */

import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const MASSIVE_API_BASE = 'https://api.massive.com'
const MASSIVE_KEY = process.env.MASSIVE_API_TOKEN?.trim() || null
// massive.com/Polygon daily aggregate timestamps are Eastern-Time day starts.
const US_TZ = 'America/New_York'

// Apify runs the Yahoo scrape for the international tickers on a residential IP
// (CI's datacenter IP is blocked by Yahoo). APIFY_ACTOR_ID is the deployed
// dc-yahoo-stock-scraper actor (e.g. `username~dc-yahoo-stock-scraper`).
const APIFY_TOKEN = process.env.APIFY_TOKEN?.trim() || null
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID?.trim() || null
// We start the actor run async and poll its status rather than using
// run-sync-get-dataset-items: the platform hard-caps the synchronous wait at
// ~5 min, and a cold-start + residential-proxy scrape of a handful of tickers
// can run past that (which is what kept this cron failing — the client aborted
// at 300s while the actor was still going). Polling lets it take as long as it
// needs, up to a generous overall budget.
const APIFY_RUN_BUDGET_MS = 12 * 60_000 // total wait for the actor run to finish
const APIFY_POLL_INTERVAL_MS = 5_000 // status poll cadence
const APIFY_REQUEST_TIMEOUT_MS = 30_000 // per REST call (start / poll / dataset read)
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

/** Smallest Yahoo `range` window that comfortably covers a lookback in days. */
function yahooRange(lookbackDays: number): string {
  if (lookbackDays <= 25) return '1mo'
  if (lookbackDays <= 80) return '3mo'
  if (lookbackDays <= 170) return '6mo'
  if (lookbackDays <= 350) return '1y'
  if (lookbackDays <= 700) return '2y'
  if (lookbackDays <= 1900) return '5y' // --full is ~5y (1855d)
  return 'max'
}

interface ApifyBar {
  ticker?: string
  trade_date?: string
  open?: number | null
  high?: number | null
  low?: number | null
  close?: number | null
  volume?: number | null
}

/** Small helper: one Apify REST call with a per-request timeout + readable errors. */
async function apifyFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(APIFY_REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ').trim()
    throw new Error(`apify ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`)
  }
  return res
}

/**
 * Daily bars for the international tickers via the Apify actor. Starts the run
 * async (the actor scrapes Yahoo on a residential IP, looping all tickers
 * internally), polls until it reaches a terminal status, then reads its dataset
 * and groups the rows by ticker so each is reported + upserted independently.
 * Polling avoids the ~5-min synchronous-endpoint cap. Throws on transport /
 * non-success terminal status / timeout.
 */
async function fetchApifyIntl(
  tickers: string[],
  lookbackDays: number
): Promise<Map<string, PriceRow[]>> {
  if (!APIFY_TOKEN || !APIFY_ACTOR_ID) {
    throw new Error('APIFY_TOKEN / APIFY_ACTOR_ID not set — cannot fetch international tickers')
  }
  const tok = encodeURIComponent(APIFY_TOKEN)

  // 1. Start the run.
  const startRes = await apifyFetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?token=${tok}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tickers, range: yahooRange(lookbackDays), interval: '1d' }),
    }
  )
  const started = ((await startRes.json()) as { data?: { id?: string } }).data
  const runId = started?.id
  if (!runId) throw new Error('apify: run start returned no run id')

  // 2. Poll the run until it terminates or we run out of budget.
  const deadline = Date.now() + APIFY_RUN_BUDGET_MS
  let datasetId: string | undefined
  for (;;) {
    await sleep(APIFY_POLL_INTERVAL_MS)
    const pollRes = await apifyFetch(
      `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${tok}`
    )
    const run = ((await pollRes.json()) as {
      data?: { status?: string; defaultDatasetId?: string }
    }).data
    const status = run?.status
    if (status === 'SUCCEEDED') {
      datasetId = run?.defaultDatasetId
      break
    }
    if (status && status !== 'RUNNING' && status !== 'READY') {
      // FAILED / ABORTED / TIMED-OUT — surface it.
      throw new Error(`apify: run ${runId} ended ${status}`)
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `apify: run ${runId} still ${status ?? 'pending'} after ${Math.round(
          APIFY_RUN_BUDGET_MS / 60_000
        )} min`
      )
    }
  }
  if (!datasetId) throw new Error('apify: succeeded run has no dataset id')

  // 3. Read the dataset.
  const itemsRes = await apifyFetch(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?token=${tok}&clean=true`
  )
  const items = (await itemsRes.json()) as ApifyBar[]
  if (!Array.isArray(items)) throw new Error('apify: unexpected response (expected a dataset array)')

  const byTicker = new Map<string, PriceRow[]>()
  for (const it of items) {
    if (!it || typeof it.ticker !== 'string' || !it.trade_date || typeof it.close !== 'number') continue
    const arr = byTicker.get(it.ticker) ?? []
    arr.push({
      ticker: it.ticker,
      trade_date: it.trade_date,
      open: it.open ?? null,
      high: it.high ?? null,
      low: it.low ?? null,
      close: it.close,
      volume: it.volume == null ? null : Math.round(it.volume),
    })
    byTicker.set(it.ticker, arr)
  }
  for (const [t, rows] of byTicker) byTicker.set(t, dedupeByDate(rows))
  return byTicker
}

/** Upsert a ticker's bars into dc_stock_prices in batches (idempotent). */
async function upsertRows(
  sb: ReturnType<typeof createServiceClient>,
  rows: PriceRow[]
): Promise<void> {
  for (let j = 0; j < rows.length; j += UPSERT_BATCH) {
    const batch = rows.slice(j, j + UPSERT_BATCH)
    const { error } = await sb
      .from('dc_stock_prices')
      .upsert(batch, { onConflict: 'ticker,trade_date' })
    if (error) throw new Error(`upsert: ${error.message}`)
  }
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
  const apifyConfigured = Boolean(APIFY_TOKEN && APIFY_ACTOR_ID)
  console.log(
    `Importing daily bars ${from} → ${to}: ${usStocks.length} US via massive.com, ` +
      `${intlStocks.length} international via Apify` +
      (args.dryRun ? ' (dry run)' : '')
  )
  if (usStocks.length > 0 && !MASSIVE_KEY) {
    console.error('⚠ MASSIVE_API_TOKEN not set — the US tickers will fail until it is')
  }
  if (intlStocks.length > 0 && !apifyConfigured) {
    console.error(
      `⚠ APIFY_TOKEN / APIFY_ACTOR_ID not set — skipping ${intlStocks.length} international ` +
        `ticker(s) until they are: ${intlStocks.map((s) => s.ticker).join(', ')}`
    )
  }

  let totalRows = 0
  const failures: string[] = []
  // Count only tickers we actually attempt (an unconfigured source is skipped,
  // not failed) so "everything we tried failed" can paint the run red.
  let attempted = 0

  // US tickers — massive.com, one request per ticker under a shared 429 gate.
  for (const stock of usStocks) {
    attempted++
    try {
      const rows = await fetchMassive(stock.ticker, from, to)
      if (rows.length === 0) {
        failures.push(stock.ticker)
        console.error(`  ✗ ${stock.ticker} (${stock.name}): 0 bars in range`)
        continue
      }
      if (!args.dryRun) await upsertRows(sb, rows)
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

  // International tickers — one Apify actor run scrapes Yahoo for all of them on
  // a residential IP, then we split the dataset back out per ticker.
  if (intlStocks.length > 0 && apifyConfigured) {
    attempted += intlStocks.length
    try {
      const byTicker = await fetchApifyIntl(
        intlStocks.map((s) => s.ticker),
        args.lookbackDays
      )
      for (const stock of intlStocks) {
        const rows = byTicker.get(stock.ticker) ?? []
        if (rows.length === 0) {
          failures.push(stock.ticker)
          console.error(`  ✗ ${stock.ticker} (${stock.name}): 0 bars from Apify`)
          continue
        }
        if (!args.dryRun) await upsertRows(sb, rows)
        totalRows += rows.length
        console.log(
          `  ✓ ${stock.ticker} (${stock.name}): ${rows.length} bars ` +
            `${rows[0].trade_date} → ${rows[rows.length - 1].trade_date}`
        )
      }
    } catch (err) {
      // The whole actor call failed — every international ticker is a failure.
      for (const stock of intlStocks) failures.push(stock.ticker)
      console.error(
        `  ✗ international fetch via Apify failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const ok = attempted - failures.length
  console.log(`\nDone. ${totalRows} bars across ${ok}/${attempted} attempted tickers.`)
  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(', ')}`)
    // Every attempted ticker failing means a source is down or misconfigured —
    // paint the run red. Partial failures stay green so one delisting or a single
    // source's bad day doesn't mask the rest.
    if (attempted > 0 && failures.length === attempted) process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
