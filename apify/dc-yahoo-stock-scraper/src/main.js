// AI Data Centers — Yahoo Finance stock scraper (Apify actor).
//
// Why this exists: Yahoo Finance blocks datacenter IPs, and both GitHub Actions
// and Vercel run on datacenter IPs — so the dc_stock_prices importer can't fetch
// the international tickers (TW/KR/JP/NL/HK) directly. This actor runs the exact
// same fetch on Apify's infrastructure through a *residential* proxy, so Yahoo
// sees a residential IP. The importer calls it via the Apify REST API
// (`run-sync-get-dataset-items`) and upserts the rows it returns.
//
// Output: one dataset item per daily bar, already shaped for dc_stock_prices —
//   { ticker, trade_date, open, high, low, close, volume }
// close is Yahoo's split-adjusted (not dividend-adjusted) close, matching the
// massive.com US feed; trade_date is the exchange-local calendar day.
//
// Input (see .actor/input_schema.json):
//   tickers    string[]  Yahoo symbols, e.g. ["2330.TW","005930.KS","ASML.AS"]
//   range      string    history window (default "3mo"): 1mo|3mo|6mo|1y|2y|5y|10y|max
//   interval   string    bar interval (default "1d")
//   proxyGroup string    "RESIDENTIAL" (default, reliable) or "DATACENTER" (free, may be blocked)

import { Actor } from 'apify'
import { ProxyAgent } from 'undici'

await Actor.init()

const {
  tickers = [],
  range = '3mo',
  interval = '1d',
  proxyGroup = 'RESIDENTIAL',
} = (await Actor.getInput()) ?? {}

if (!Array.isArray(tickers) || tickers.length === 0) {
  throw new Error('Input "tickers" must be a non-empty array of Yahoo symbols')
}

// A real desktop UA — the v8 chart endpoint is public JSON (no crumb/cookie
// needed, unlike quoteSummary), so a residential IP + browser UA is enough.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const proxyConfiguration = await Actor.createProxyConfiguration({ groups: [proxyGroup] })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Fetch + shape one ticker's daily bars, retrying transient failures on fresh IPs. */
async function fetchTicker(ticker) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`

  let lastErr
  for (let attempt = 0; attempt < 4; attempt++) {
    // A per-(ticker,attempt) session id rotates to a fresh residential IP on retry.
    const proxyUrl = await proxyConfiguration?.newUrl(`${ticker.replace(/\W/g, '')}${attempt}`)
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined
    try {
      const res = await fetch(url, {
        dispatcher,
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      })
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`)
        await sleep(1500 * 2 ** attempt)
        continue
      }
      const body = await res.json()
      const apiErr = body?.chart?.error
      if (apiErr) throw new Error(`${apiErr.code}: ${apiErr.description ?? 'chart error'}`)
      const result = body?.chart?.result?.[0]
      if (!result?.timestamp) return []

      const tz = result.meta?.exchangeTimezoneName || 'UTC'
      const q = result.indicators?.quote?.[0] ?? {}
      const byDate = new Map()
      for (let i = 0; i < result.timestamp.length; i++) {
        const close = q.close?.[i]
        if (close == null) continue // holidays / half-days come back null
        const tradeDate = new Date(result.timestamp[i] * 1000).toLocaleDateString('en-CA', {
          timeZone: tz,
        })
        byDate.set(tradeDate, {
          ticker,
          trade_date: tradeDate,
          open: q.open?.[i] ?? null,
          high: q.high?.[i] ?? null,
          low: q.low?.[i] ?? null,
          close,
          volume: q.volume?.[i] == null ? null : Math.round(q.volume[i]),
        })
      }
      return [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    } catch (err) {
      lastErr = err
      await sleep(1500 * 2 ** attempt)
    }
  }
  throw lastErr ?? new Error('fetch failed')
}

// Scrape all tickers concurrently — each uses its own proxy session, so there's
// no shared rate limit to respect, and running them in parallel keeps the whole
// run well under the caller's budget even when a residential IP is slow.
const results = await Promise.all(
  tickers.map(async (ticker) => {
    try {
      const rows = await fetchTicker(ticker)
      if (rows.length === 0) {
        console.warn(`${ticker}: 0 bars`)
        return false
      }
      await Actor.pushData(rows)
      console.log(
        `${ticker}: ${rows.length} bars (${rows[0].trade_date} → ${rows[rows.length - 1].trade_date})`,
      )
      return true
    } catch (err) {
      console.error(`${ticker}: ${err?.message ?? err}`)
      return false
    }
  }),
)

const ok = results.filter(Boolean).length
const failed = results.length - ok

console.log(`Done — ${ok}/${tickers.length} ok, ${failed} failed`)
await Actor.exit()
