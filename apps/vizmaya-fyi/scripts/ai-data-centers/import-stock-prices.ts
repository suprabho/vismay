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
 * Rate limiting: Yahoo throttles per IP and sheds anonymous traffic from
 * shared IPs (GitHub Actions runners especially) first, so the fetch path
 * layers several defences — a browser-like cookie+crumb session, query1/
 * query2 host rotation, a run-wide Retry-After-aware cooldown (one 429 means
 * the next request will 429 too, so the whole run pauses, not one symbol),
 * and up to three passes over rate-limited tickers with a long cool-down and
 * a fresh session between passes.
 *
 * The durable fix for CI is to change the egress IP: set STOCKS_HTTPS_PROXY to
 * a residential proxy URL and every Yahoo request leaves from a real-user IP
 * instead of the shared runner IP Yahoo blocks. The defences above still run
 * as a backstop. Unset the var and requests go direct (fine for local dev).
 *
 * Run locally:  pnpm ai-data-centers:import-stocks
 *               pnpm ai-data-centers:import-stocks -- --full        # 5y backfill
 *               pnpm ai-data-centers:import-stocks -- --range 3mo
 *               pnpm ai-data-centers:import-stocks -- --ticker NVDA --dry-run
 * Run in CI:    .github/workflows/import-dc-stock-prices.yml (weekday cron)
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Optional env: STOCKS_HTTPS_PROXY — route Yahoo through a residential proxy
 *   (http://user:pass@host:port) to dodge datacenter-IP 429s from CI runners.
 *
 * Idempotency: upsert on (ticker, trade_date). Trading days are computed in
 * the exchange's own timezone (meta.exchangeTimezoneName), so a Tokyo bar
 * lands on its Tokyo date regardless of when the cron fires. A bar written
 * mid-session is partial but self-heals — the next run overwrites it with the
 * completed bar. `close` follows Yahoo v8 semantics: split-adjusted, not
 * dividend-adjusted.
 */

import { config as loadEnv } from 'dotenv'
import { fetch, ProxyAgent, setGlobalDispatcher, type Response } from 'undici'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

/**
 * Build an undici ProxyAgent from a proxy URL, lifting any `user:pass` in the
 * URL into a Proxy-Authorization header (undici wants credentials out of the
 * CONNECT uri). Handles Massive's gateway
 * (`http://USER:PASS@network.joinmassive.com:65534`) and any plain host:port.
 */
function proxyDispatcher(raw: string): ProxyAgent {
  const u = new URL(raw)
  const uri = `${u.protocol}//${u.host}`
  if (!u.username && !u.password) return new ProxyAgent({ uri })
  const creds = `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`
  return new ProxyAgent({ uri, token: `Basic ${Buffer.from(creds).toString('base64')}` })
}

// Yahoo sheds anonymous traffic from shared datacenter IPs first, so a plain
// fetch from a GitHub Actions runner 429s on the very first request. When
// STOCKS_HTTPS_PROXY is set, route every request in this module through it so
// Yahoo sees a residential IP. `fetch` is imported from undici (not the global)
// because the global fetch ignores a userland dispatcher; the Supabase client
// keeps the global fetch, so DB writes never travel through the proxy.
const PROXY_URL = process.env.STOCKS_HTTPS_PROXY?.trim() || null
if (PROXY_URL) setGlobalDispatcher(proxyDispatcher(PROXY_URL))

// query2 is a mirror — trying both hosts rides out per-host rate limiting.
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
// Yahoo 429s obvious non-browser agents on some edges.
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const DEFAULT_RANGE = '1mo' // daily incremental — generous overlap, upsert dedupes
const FULL_RANGE = '5y'
const UPSERT_BATCH = 500
const TICKER_DELAY_MS = 600
const TICKER_JITTER_MS = 400 // uniform spacing looks like a bot — smear it
const FETCH_TIMEOUT_MS = 15_000
const MAX_FETCH_ROUNDS = 3
// Run-wide 429 cooldown (see `limiter`): first hit pauses everything 20s,
// repeats double it up to 60s. A Retry-After above the cap is ignored — the
// pass-level cool-down handles sustained throttling.
const RATE_LIMIT_BASE_MS = 20_000
const RATE_LIMIT_MAX_MS = 60_000
// Tickers that failed on rate limiting get re-tried in later passes, each
// behind a longer cool-down and a fresh Yahoo session.
const MAX_PASSES = 3
const PASS_COOLDOWN_MS = 90_000
// Two consecutive tickers exhausting their retries on pure 429s means the IP
// is hard-throttled — defer the rest of the pass instead of grinding through.
const MAX_CONSECUTIVE_RATE_LIMITED = 2

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

interface YahooSession {
  cookie: string | null
  crumb: string | null
}

/**
 * Bootstrap a browser-like Yahoo session. fc.yahoo.com sets an `A3` cookie on
 * any response (even its usual 404), and the crumb endpoint turns that cookie
 * into an API token. Both are optional — the chart endpoint answers keyless
 * requests too — but anonymous traffic is the first thing Yahoo's edge sheds
 * when throttling, so a session dramatically cuts 429s from CI runners.
 */
async function createSession(): Promise<YahooSession> {
  const session: YahooSession = { cookie: null, crumb: null }
  try {
    const res = await fetch('https://fc.yahoo.com/', {
      headers: { 'user-agent': USER_AGENT },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const cookies = res.headers.getSetCookie?.() ?? []
    session.cookie =
      cookies
        .map((c) => c.split(';')[0])
        .filter(Boolean)
        .join('; ') || null
  } catch {
    // keyless fallback
  }
  if (!session.cookie) return session
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'user-agent': USER_AGENT, accept: 'text/plain', cookie: session.cookie },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.ok) {
      const text = (await res.text()).trim()
      // An HTML error page here just means "no crumb today".
      if (text && text.length <= 64 && !text.includes('<')) session.crumb = text
    }
  } catch {
    // crumb is optional
  }
  return session
}

/**
 * Yahoo rate-limits per IP, not per symbol — one 429 means the next request
 * will 429 too. Every fetch funnels through this shared gate: a 429 escalates
 * a run-wide cooldown (honouring Retry-After up to the cap), a success
 * resets it.
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

/** A fetch that exhausted its retries on nothing but 429s — retriable in a later pass. */
class RateLimitError extends Error {}

function retryAfterMs(res: Response): number {
  const seconds = Number(res.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
}

/**
 * Fetch one symbol's daily bars, rotating hosts with backoff. Returns null
 * for a symbol Yahoo doesn't know (logged upstream) — everything else throws
 * after the retries are exhausted; RateLimitError specifically when every
 * response was a 429, so the caller can defer to a later pass.
 */
async function fetchChart(
  symbol: string,
  range: string,
  session: YahooSession
): Promise<YahooChart | null> {
  const path =
    `/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${encodeURIComponent(range)}&interval=1d&includePrePost=false` +
    (session.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : '')
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/json' }
  if (session.cookie) headers.cookie = session.cookie
  let lastErr: Error | null = null
  let only429s = true
  for (let attempt = 0; attempt < MAX_FETCH_ROUNDS; attempt++) {
    for (const host of YAHOO_HOSTS) {
      await limiter.gate()
      try {
        const res = await fetch(`https://${host}${path}`, {
          headers,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (res.status === 404) return null
        if (res.ok) {
          limiter.settle()
          return (await res.json()) as YahooChart
        }
        lastErr = new Error(`${host} ${res.status} ${res.statusText}`)
        if (res.status === 429) limiter.hit(retryAfterMs(res))
        else only429s = false
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        only429s = false
      }
    }
    // Two full rounds of nothing but 429s while the shared cooldown is
    // already escalating: grinding on just drains the run's time budget —
    // bail and let the pass-level retry (fresh session, longer cool-down)
    // pick this symbol up again.
    if (only429s && attempt >= 1) throw new RateLimitError(lastErr?.message ?? '429')
    // 429 pacing is the limiter's job; this backoff is for transient errors.
    if (attempt < MAX_FETCH_ROUNDS - 1 && !only429s) {
      await sleep(2000 * 2 ** attempt + Math.random() * 1000)
    }
  }
  if (only429s) throw new RateLimitError(lastErr?.message ?? '429')
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
  console.log(
    PROXY_URL
      ? `Routing Yahoo requests through proxy ${new URL(PROXY_URL).host}`
      : 'No STOCKS_HTTPS_PROXY set — Yahoo requests go direct (expect 429s from CI)'
  )

  let session = await createSession()
  console.log(
    session.cookie
      ? `Yahoo session ready (cookie${session.crumb ? ' + crumb' : ''})`
      : 'No Yahoo session cookie — continuing keyless'
  )

  let totalRows = 0
  const failures: string[] = [] // 404s / empty responses — never retried
  let pending = stocks

  for (let pass = 1; pass <= MAX_PASSES && pending.length > 0; pass++) {
    if (pass > 1) {
      const cooldown = PASS_COOLDOWN_MS * (pass - 1)
      console.log(
        `\nRetry pass ${pass}/${MAX_PASSES}: ${pending.length} ticker(s) ` +
          `after a ${cooldown / 1000}s cool-down`
      )
      await sleep(cooldown)
      // A fresh cookie often lands in a different rate bucket.
      session = await createSession()
      limiter.settle()
    }

    const retriable: typeof pending = []
    let consecutiveRateLimited = 0
    for (let i = 0; i < pending.length; i++) {
      const stock = pending[i]
      try {
        const chart = await fetchChart(stock.ticker, args.range, session)
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
          for (let j = 0; j < rows.length; j += UPSERT_BATCH) {
            const batch = rows.slice(j, j + UPSERT_BATCH)
            const { error: upsertErr } = await sb
              .from('dc_stock_prices')
              .upsert(batch, { onConflict: 'ticker,trade_date' })
            if (upsertErr) throw new Error(`upsert: ${upsertErr.message}`)
          }
        }
        totalRows += rows.length
        consecutiveRateLimited = 0
        console.log(
          `  ✓ ${stock.ticker} (${stock.name}): ${rows.length} bars ` +
            `${rows[0].trade_date} → ${rows[rows.length - 1].trade_date}`
        )
      } catch (err) {
        retriable.push(stock)
        const msg = err instanceof Error ? err.message : String(err)
        console.error(
          `  ✗ ${stock.ticker} (${stock.name}): ${msg}` +
            (pass < MAX_PASSES ? ' (will retry)' : '')
        )
        if (err instanceof RateLimitError) {
          consecutiveRateLimited++
          if (consecutiveRateLimited >= MAX_CONSECUTIVE_RATE_LIMITED && i < pending.length - 1) {
            const deferred = pending.slice(i + 1)
            retriable.push(...deferred)
            console.error(
              `  -- rate-limited ${consecutiveRateLimited}× in a row — ` +
                `abandoning this pass (${deferred.length} ticker(s) not attempted)`
            )
            break
          }
        }
      }
      await sleep(TICKER_DELAY_MS + Math.random() * TICKER_JITTER_MS)
    }
    pending = retriable
  }

  // Whatever is still pending exhausted every pass — count it as failed.
  failures.push(...pending.map((s) => s.ticker))

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
