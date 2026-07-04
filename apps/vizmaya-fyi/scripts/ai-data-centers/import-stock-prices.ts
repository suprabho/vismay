/**
 * AI Data Centers stock price importer — pulls daily OHLCV bars for every
 * active ticker in dc_stocks from Yahoo Finance's v8 chart API and upserts
 * into dc_stock_prices. Each company is tracked on its home exchange
 * (2330.TW, 005930.KS, ASML.AS, 8035.T, …), so prices move in the listing's
 * own market and native currency.
 *
 * Yahoo's chart endpoint is keyless and covers every market in the registry;
 * dedicated free APIs (Stooq, Alpha Vantage) either miss the Taiwan/Korea
 * listings or cap requests too low for a daily fleet-wide pull.
 *
 * Run locally:  pnpm ai-data-centers:import-stocks
 *               pnpm ai-data-centers:import-stocks -- --full        # 5y backfill
 *               pnpm ai-data-centers:import-stocks -- --range 3mo
 *               pnpm ai-data-centers:import-stocks -- --ticker NVDA --dry-run
 * Run in CI:    .github/workflows/import-dc-stock-prices.yml (weekday cron)
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Idempotency: upsert on (ticker, trade_date). Trading days are computed in
 * the exchange's own timezone (meta.exchangeTimezoneName), so a Tokyo bar
 * lands on its Tokyo date regardless of when the cron fires. A bar written
 * mid-session is partial but self-heals — the next run overwrites it with the
 * completed bar. `close` follows Yahoo v8 semantics: split-adjusted, not
 * dividend-adjusted.
 */

import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

// query2 is a mirror — trying both hosts rides out per-host rate limiting.
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
// Yahoo 429s obvious non-browser agents on some edges.
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const DEFAULT_RANGE = '1mo' // daily incremental — generous overlap, upsert dedupes
const FULL_RANGE = '5y'
const UPSERT_BATCH = 500
const TICKER_DELAY_MS = 400

interface Args {
  range: string
  dryRun: boolean
  ticker: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { range: DEFAULT_RANGE, dryRun: false, ticker: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    // pnpm forwards the `--` separator itself (npm strips it), so a bare
    // `pnpm ai-data-centers:import-stocks -- --full` delivers ['--', '--full'].
    if (a === '--') continue
    if (a === '--full') args.range = FULL_RANGE
    else if (a === '--range') args.range = argv[++i] ?? DEFAULT_RANGE
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--ticker') args.ticker = argv[++i] ?? null
    else throw new Error(`Unknown flag: ${a}`)
  }
  return args
}

interface YahooChart {
  chart: {
    result?: Array<{
      meta?: { exchangeTimezoneName?: string; currency?: string }
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: (number | null)[]
          high?: (number | null)[]
          low?: (number | null)[]
          close?: (number | null)[]
          volume?: (number | null)[]
        }>
      }
    }>
    error?: { code?: string; description?: string } | null
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetch one symbol's daily bars, rotating hosts with backoff. Returns null
 * for a symbol Yahoo doesn't know (logged upstream) — everything else throws
 * after the retries are exhausted.
 */
async function fetchChart(symbol: string, range: string): Promise<YahooChart | null> {
  const path =
    `/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${encodeURIComponent(range)}&interval=1d&includePrePost=false`
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const host of YAHOO_HOSTS) {
      try {
        const res = await fetch(`https://${host}${path}`, {
          headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        })
        if (res.status === 404) return null
        if (!res.ok) {
          lastErr = new Error(`${host} ${res.status} ${res.statusText}`)
          continue
        }
        return (await res.json()) as YahooChart
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
      }
    }
    await sleep(2000 * 2 ** attempt)
  }
  throw lastErr ?? new Error(`fetch failed for ${symbol}`)
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

/** Epoch seconds → YYYY-MM-DD in the exchange's own calendar. */
function tradeDate(ts: number, timeZone: string): string {
  return new Date(ts * 1000).toLocaleDateString('en-CA', { timeZone })
}

function shapeRows(ticker: string, chart: YahooChart): PriceRow[] {
  const result = chart.chart.result?.[0]
  if (!result) {
    const err = chart.chart.error
    throw new Error(err ? `${err.code}: ${err.description}` : 'empty chart result')
  }
  const timeZone = result.meta?.exchangeTimezoneName ?? 'UTC'
  const timestamps = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0] ?? {}
  const rows: PriceRow[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i]
    // Yahoo pads holidays/suspensions with all-null entries — skip them.
    if (close == null) continue
    rows.push({
      ticker,
      trade_date: tradeDate(timestamps[i], timeZone),
      open: quote.open?.[i] ?? null,
      high: quote.high?.[i] ?? null,
      low: quote.low?.[i] ?? null,
      close,
      volume: quote.volume?.[i] ?? null,
    })
  }
  // Rare duplicate timestamps within a session collapse to the last bar.
  const byDate = new Map<string, PriceRow>()
  for (const row of rows) byDate.set(row.trade_date, row)
  return [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sb = createServiceClient()

  let query = sb
    .from('dc_stocks')
    .select('ticker, name')
    .eq('is_active', true)
    .order('ticker')
  if (args.ticker) query = query.eq('ticker', args.ticker)
  const { data: stockRows, error: stocksErr } = await query
  if (stocksErr) throw new Error(`dc_stocks read failed: ${stocksErr.message}`)
  const stocks = (stockRows ?? []) as { ticker: string; name: string }[]
  if (stocks.length === 0) {
    throw new Error(
      args.ticker
        ? `No active dc_stocks row for ${args.ticker}`
        : 'dc_stocks is empty — apply migration 065 before importing'
    )
  }

  console.log(
    `Importing ${args.range} of daily bars for ${stocks.length} ticker(s)` +
      (args.dryRun ? ' (dry run)' : '')
  )

  let totalRows = 0
  const failures: string[] = []
  for (const stock of stocks) {
    try {
      const chart = await fetchChart(stock.ticker, args.range)
      if (!chart) {
        failures.push(stock.ticker)
        console.error(`  ✗ ${stock.ticker} (${stock.name}): unknown symbol (404)`)
        continue
      }
      const rows = shapeRows(stock.ticker, chart)
      if (rows.length === 0) {
        failures.push(stock.ticker)
        console.error(`  ✗ ${stock.ticker} (${stock.name}): 0 bars in response`)
        continue
      }
      if (!args.dryRun) {
        for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
          const batch = rows.slice(i, i + UPSERT_BATCH)
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
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ ${stock.ticker} (${stock.name}): ${msg}`)
    }
    await sleep(TICKER_DELAY_MS)
  }

  console.log(
    `\nDone. ${totalRows} bars across ${stocks.length - failures.length}/${stocks.length} tickers.`
  )
  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(', ')}`)
    // Every ticker failing means the source is down or blocking us — paint
    // the run red. Partial failures stay green so one delisting doesn't
    // mask 28 fresh series.
    if (failures.length === stocks.length) process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
