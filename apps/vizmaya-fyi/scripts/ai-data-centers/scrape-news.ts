/**
 * AI Data Centers news scraper — consumes Google News' RSS search across four
 * queries (AI data centers, semiconductors, microprocessors, AI infra), has
 * Claude Haiku classify each new article (relevance gate + topic tags +
 * tracked tickers from dc_stocks), and upserts into dc_news.
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
 *   ANTHROPIC_API_KEY                                    — topic/ticker tagging
 *
 * Idempotency: source_url is the natural key (unique in migration 065).
 * Classifier rejects are stored with relevant=false — the queries here are
 * broader than the energy scraper's, so persisting rejects is what stops the
 * same off-topic article being re-sent to the LLM on every run while it sits
 * in the feed.
 *
 * Throughput: the four queries surface ~200-250 never-seen articles per day,
 * so classification runs through a bounded worker pool, and a soft deadline
 * stops the loop cleanly before the workflow's 30-minute kill — leftovers are
 * re-seen as new on the next run. (The sequential Gemma version needed 40-60
 * min/day and was hard-killed at 30 for weeks.)
 */

import Anthropic from '@anthropic-ai/sdk'
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

// Haiku is the right tier for a yes/no + tags call: ~1-2s/item vs the 8-15s
// Gemma took, and structured outputs make the JSON shape a guarantee rather
// than a regex scrape.
const CLASSIFIER_MODEL = 'claude-haiku-4-5'
const CONCURRENCY = 4
// Stop pulling new items past this, well under the workflow's 30-minute
// timeout, so the job always exits green with a summary instead of being
// hard-killed mid-loop.
const DEADLINE_MS = 25 * 60_000

const CLASSIFICATION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    relevant: { type: 'boolean' },
    topics: { type: 'array', items: { type: 'string' } },
    tickers: { type: 'array', items: { type: 'string' } },
  },
  required: ['relevant', 'topics', 'tickers'],
  additionalProperties: false,
}

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
  anthropic: Anthropic,
  system: string,
  item: NewsItem,
  validTickers: Set<string>
): Promise<Classification> {
  const userText = `Headline: ${item.title}\n\n${
    item.summary ? `Summary: ${item.summary}` : '(no summary available)'
  }`

  const response = await anthropic.messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 256,
    system,
    messages: [{ role: 'user', content: userText }],
    output_config: { format: { type: 'json_schema', schema: CLASSIFICATION_SCHEMA } },
  })

  let text = ''
  for (const block of response.content) {
    if (block.type === 'text') {
      text = block.text
      break
    }
  }
  // output_config guarantees schema-valid JSON on a normal finish; a refusal
  // or max_tokens cut can still yield unparseable text — treat as off-topic.
  try {
    const parsed = JSON.parse(text) as {
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

/** Run `worker` over `items` with a bounded number of concurrent tasks. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

async function main() {
  const sb = createServiceClient()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  // 60s per-request cap + the SDK's built-in 429/5xx retries: a hung or
  // throttled call surfaces as a throw the per-item retry below can handle,
  // instead of stalling a pool worker for minutes.
  const anthropic = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 })
  const startedAt = Date.now()

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
  let feedFailures = 0
  for (const query of FEED_QUERIES) {
    console.log(`Fetching Google News RSS for ${query} ...`)
    let feedItems: NewsItem[]
    try {
      feedItems = await fetchFeed(query)
    } catch {
      // Google News occasionally 503s a single query; one retry, then keep
      // going with the other feeds instead of failing the whole run.
      await sleep(10_000)
      try {
        feedItems = await fetchFeed(query)
      } catch (retryErr) {
        const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        console.warn(`  skipping feed: ${msg}`)
        feedFailures++
        continue
      }
    }
    console.log(`  ${feedItems.length} items`)
    for (const item of feedItems) {
      if (!byUrl.has(item.url)) byUrl.set(item.url, item)
    }
  }
  if (feedFailures === FEED_QUERIES.length) {
    throw new Error('All feeds failed — Google News RSS outage?')
  }
  const items = [...byUrl.values()]
  console.log(
    `${items.length} unique items across ${FEED_QUERIES.length - feedFailures} feeds`
  )

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
  let skipped = 0
  let failed = 0
  await pool(newItems, CONCURRENCY, async (item) => {
    if (Date.now() - startedAt > DEADLINE_MS) {
      skipped++
      return
    }
    try {
      let cls: Classification
      try {
        cls = await classify(anthropic, system, item, validTickers)
      } catch {
        // One retry after a pause, on top of the SDK's own backoff — the
        // first run can push a few hundred items through in one go.
        await sleep(5000)
        cls = await classify(anthropic, system, item, validTickers)
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
        return
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
      await sleep(300) // spaces each worker's requests under the RPM ceiling
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ ${item.url}: ${msg}`)
    }
  })

  // Every attempt failing means a systemic problem (bad key, no credits, API
  // outage) — fail the run so the cron goes red instead of green-but-empty.
  if (failed > 0 && inserted + rejected === 0) {
    throw new Error(
      `All ${failed} classification attempts failed — check ANTHROPIC_API_KEY / account credits`
    )
  }

  if (skipped > 0) {
    console.log(
      `\nDeadline reached — processed ${newItems.length - skipped} of ${newItems.length} new items; the rest will be picked up next run.`
    )
  }
  console.log(
    `\nDone. ${inserted} relevant + ${rejected} off-topic stored, of ${newItems.length} new items.`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
