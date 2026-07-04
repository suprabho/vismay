/**
 * AI Data Centers news scraper — consumes Google News' RSS search across four
 * queries (AI data centers, semiconductors, microprocessors, AI infra), has
 * Gemma classify each new article (relevance gate + topic tags + tracked
 * tickers from dc_stocks), and upserts into dc_news.
 *
 * Google News RSS for the same reason as scrape-energy-profile-news.ts:
 * a free, machine-friendly feed with broad outlet coverage (Reuters,
 * Bloomberg, trade press) that works from any IP — no per-publisher scraping.
 *
 * Run locally:  pnpm ai-data-centers:scrape-news
 * Run in CI:    .github/workflows/scrape-ai-data-centers-news.yml (daily cron)
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — read dc_stocks, write dc_news
 *   GEMINI_API_KEY                                       — topic/ticker tagging
 *
 * Idempotency: source_url is the natural key (unique in migration 065).
 * Classifier rejects are stored with relevant=false — the queries here are
 * broader than the energy scraper's, so persisting rejects is what stops the
 * same off-topic article being re-sent to the LLM on every run while it sits
 * in the feed.
 */

import { GoogleGenAI } from '@google/genai'
import { JSDOM } from 'jsdom'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

// Each query returns up to ~100 items; overlap between them is deduped by URL
// before the DB lookup. Kept deliberately broad — the LLM relevance gate is
// the precision filter, not the query.
const FEED_QUERIES = [
  '"AI data center" OR "AI data centre"',
  'semiconductor OR chipmaker',
  'microprocessor OR "chip manufacturing"',
  '"AI infrastructure" OR "AI chips" OR hyperscaler',
]

const TOPIC_VOCABULARY = ['ai', 'data-centers', 'semiconductors', 'microprocessors'] as const

function feedUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
}

interface NewsItem {
  url: string
  title: string
  summary: string | null
  publishedAt: string
  source: string | null
}

async function fetchFeed(query: string): Promise<NewsItem[]> {
  const res = await fetch(feedUrl(query), {
    headers: { 'user-agent': 'vizmaya-ai-data-centers-scraper/1.0 (+https://vizmaya.fyi)' },
  })
  if (!res.ok) {
    throw new Error(`RSS fetch failed for "${query}": ${res.status} ${res.statusText}`)
  }
  const xml = await res.text()
  const dom = new JSDOM(xml, { contentType: 'text/xml' })
  const items: NewsItem[] = []
  for (const item of dom.window.document.querySelectorAll('item')) {
    const url = item.querySelector('link')?.textContent?.trim()
    const rawTitle = item.querySelector('title')?.textContent?.trim()
    const pubDate = item.querySelector('pubDate')?.textContent?.trim()
    const description = item.querySelector('description')?.textContent?.trim() ?? null
    const source = item.querySelector('source')?.textContent?.trim() ?? null
    if (!url || !rawTitle || !pubDate) continue
    // Google News appends " - <Source>" to every title. Strip when the source
    // is known so headlines render cleanly.
    const title =
      source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(` - ${source}`.length))
        : rawTitle
    items.push({
      url,
      title,
      summary: description,
      publishedAt: new Date(pubDate).toISOString(),
      source,
    })
  }
  return items
}

interface TrackedStock {
  ticker: string
  name: string
}

function classifierSystem(stocks: TrackedStock[]): string {
  const tickerList = stocks.map((s) => `${s.ticker} — ${s.name}`).join('\n')
  return `You classify news headlines for a dashboard tracking the AI infrastructure build-out: AI data centers, microprocessors, and the semiconductor industry.

Topic vocabulary (use ONLY these tags):
- "ai"               — AI models, AI compute demand, AI industry moves
- "data-centers"     — data center construction, capacity, power, siting, operators
- "semiconductors"   — chip industry, foundries, memory, equipment, supply chain
- "microprocessors"  — CPUs/GPUs/accelerators as products or architectures

Tracked companies (ticker — name):
${tickerList}

Rules:
- relevant=false when the story is NOT materially about AI compute, data centers, chip making, chip markets, or a tracked company's AI/semiconductor/data-center business. Consumer gadget reviews, gaming deals, unrelated corporate or general-market news → relevant=false with empty arrays.
- topics: every vocabulary tag that clearly applies (usually 1–2).
- tickers: ONLY companies explicitly named in the headline or summary, or the unmistakable primary subject. Use the exact ticker strings from the list. Empty array if none.

Respond ONLY with valid JSON in this exact shape, no markdown fences:
{"relevant": true, "topics": ["semiconductors"], "tickers": ["NVDA"]}`
}

interface Classification {
  relevant: boolean
  topics: string[]
  tickers: string[]
}

async function classify(
  genai: GoogleGenAI,
  system: string,
  item: NewsItem,
  validTickers: Set<string>
): Promise<Classification> {
  const userText = `Headline: ${item.title}\n\n${
    item.summary ? `Summary: ${item.summary}` : '(no summary available)'
  }`

  const response = await genai.models.generateContent({
    model: 'gemma-4-26b-a4b-it',
    contents: `${system}\n\n${userText}`,
  })

  const text = response.text ?? ''
  // Gemma doesn't honour responseSchema, so scrape the first JSON object out
  // of the free-form text (same idiom as scrape-energy-profile-news.ts).
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { relevant: false, topics: [], tickers: [] }
  try {
    const parsed = JSON.parse(match[0]) as {
      relevant?: unknown
      topics?: unknown
      tickers?: unknown
    }
    const topics = (Array.isArray(parsed.topics) ? parsed.topics : [])
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.toLowerCase().trim())
      .filter((t) => (TOPIC_VOCABULARY as readonly string[]).includes(t))
    const tickers = (Array.isArray(parsed.tickers) ? parsed.tickers : [])
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.toUpperCase().trim())
      .filter((t) => validTickers.has(t))
    // A "relevant" verdict with no recognised topic is noise — gate on both.
    const relevant = parsed.relevant === true && topics.length > 0
    return { relevant, topics: relevant ? topics : [], tickers: relevant ? tickers : [] }
  } catch {
    return { relevant: false, topics: [], tickers: [] }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const sb = createServiceClient()
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  const genai = new GoogleGenAI({ apiKey })

  // The classifier's ticker list comes from dc_stocks so the migration seed
  // stays the single source of truth — adding a company needs no code change.
  const { data: stockRows, error: stocksErr } = await sb
    .from('dc_stocks')
    .select('ticker, name')
    .eq('is_active', true)
    .order('ticker')
  if (stocksErr) throw new Error(`dc_stocks read failed: ${stocksErr.message}`)
  const stocks = (stockRows ?? []) as TrackedStock[]
  if (stocks.length === 0) {
    throw new Error('dc_stocks is empty — apply migration 065 before scraping')
  }
  const validTickers = new Set(stocks.map((s) => s.ticker))
  const system = classifierSystem(stocks)

  const byUrl = new Map<string, NewsItem>()
  for (const query of FEED_QUERIES) {
    console.log(`Fetching Google News RSS for ${query} ...`)
    const items = await fetchFeed(query)
    console.log(`  ${items.length} items`)
    for (const item of items) {
      if (!byUrl.has(item.url)) byUrl.set(item.url, item)
    }
  }
  const items = [...byUrl.values()]
  console.log(`${items.length} unique items across ${FEED_QUERIES.length} feeds`)

  if (items.length === 0) {
    console.log('Empty feeds — nothing to do')
    return
  }

  const urls = items.map((i) => i.url)
  // Google News redirect URLs run ~500 chars each. Stuffing them all into a
  // single `.in()` blows past PostgREST's URL length limit (8KB), which
  // surfaces as a 400 Bad Request. Batch the lookup at ~15/page (~7.5KB).
  const existingUrls = new Set<string>()
  const LOOKUP_BATCH = 15
  for (let i = 0; i < urls.length; i += LOOKUP_BATCH) {
    const batch = urls.slice(i, i + LOOKUP_BATCH)
    const { data, error: lookupErr } = await sb
      .from('dc_news')
      .select('source_url')
      .in('source_url', batch)
    if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`)
    for (const row of (data ?? []) as { source_url: string }[]) {
      existingUrls.add(row.source_url)
    }
  }

  const newItems = items.filter((i) => !existingUrls.has(i.url))
  console.log(
    `${newItems.length} new (${items.length - newItems.length} already in DB)`
  )

  let inserted = 0
  let rejected = 0
  for (const item of newItems) {
    try {
      let cls: Classification
      try {
        cls = await classify(genai, system, item, validTickers)
      } catch {
        // One retry after a pause — the first run can push a few hundred
        // items through and brush the free-tier RPM limit.
        await sleep(5000)
        cls = await classify(genai, system, item, validTickers)
      }
      const { error: insertErr } = await sb.from('dc_news').upsert(
        {
          source_url: item.url,
          title: item.title,
          summary: item.summary,
          source: item.source,
          published_at: item.publishedAt,
          relevant: cls.relevant,
          topics: cls.topics,
          tickers: cls.tickers,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'source_url' }
      )
      if (insertErr) {
        console.error(`  ✗ ${item.url}: ${insertErr.message}`)
        continue
      }
      if (cls.relevant) {
        inserted++
        console.log(
          `  ✓ [${item.source ?? '?'}] ${item.title}  →  [${cls.topics.join(', ')}]${
            cls.tickers.length > 0 ? ` (${cls.tickers.join(', ')})` : ''
          }`
        )
      } else {
        rejected++
        console.log(`  · [${item.source ?? '?'}] ${item.title}  →  off-topic`)
      }
      await sleep(300) // stay under the Gemini free-tier RPM ceiling
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ ${item.url}: ${msg}`)
    }
  }

  console.log(
    `\nDone. ${inserted} relevant + ${rejected} off-topic stored, of ${newItems.length} new items.`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
