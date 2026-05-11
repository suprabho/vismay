/**
 * IEA news scraper — consumes Google News' RSS search for "International
 * Energy Agency", tags each new article with ISO country codes via Claude,
 * and upserts into iea_news.
 *
 * Why Google News and not iea.org directly? IEA's site fronts a JS-driven
 * SPA behind Cloudflare bot detection — Playwright in CI either 403s or
 * times out on selectors. Google News RSS is a free, machine-friendly
 * feed that surfaces the same IEA stories (with broader coverage from
 * Reuters / Bloomberg / etc) and works from any IP.
 *
 * Run locally:  pnpm iea:scrape
 * Run in CI:    .github/workflows/scrape-iea-news.yml (daily cron)
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write to iea_news
 *   ANTHROPIC_API_KEY                                    — country tagging
 *
 * Idempotency: source_url is the natural key (unique in migration 015).
 * Google News redirect URLs are stable per-article, so re-runs are no-ops.
 */

import Anthropic from '@anthropic-ai/sdk'
import { JSDOM } from 'jsdom'
import { createServiceClient } from '../../lib/supabase'

const FEED_URL =
  'https://news.google.com/rss/search?q=%22International+Energy+Agency%22&hl=en-US&gl=US&ceid=US:en'

interface NewsItem {
  url: string
  title: string
  summary: string | null
  publishedAt: string
  source: string | null
}

async function fetchFeed(): Promise<NewsItem[]> {
  const res = await fetch(FEED_URL, {
    headers: { 'user-agent': 'vizmaya-iea-scraper/1.0 (+https://vizmaya.fyi)' },
  })
  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${res.status} ${res.statusText}`)
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

const COUNTRY_TAGGING_SYSTEM = `You extract ISO 3166-1 alpha-2 country codes from energy news headlines that mention or discuss the International Energy Agency (IEA).

Return ONLY country codes that are:
- Explicitly named in the headline or summary, OR
- The clear primary subject (e.g. "Japan's nuclear restart" → JP)

Empty array if the article is about:
- IEA organisational actions with no specific country focus (general reports, methodology, board appointments)
- Global aggregates ("global emissions", "world coal demand")
- Multi-region groupings with no specific country focus

Use the special code "EU" only when the European Union is explicitly named as a bloc; otherwise drop down to specific member-state codes.`

async function extractCountryCodes(
  anthropic: Anthropic,
  item: NewsItem
): Promise<string[]> {
  const userText = `Headline: ${item.title}\n\n${
    item.summary ? `Summary: ${item.summary}` : '(no summary available)'
  }`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: COUNTRY_TAGGING_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            country_codes: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['country_codes'],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: 'user', content: userText }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') return []
  try {
    const parsed = JSON.parse(textBlock.text) as { country_codes?: unknown }
    const raw = Array.isArray(parsed.country_codes) ? parsed.country_codes : []
    return raw
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.toUpperCase().trim())
      .filter((c) => /^[A-Z]{2}$/.test(c))
  } catch {
    return []
  }
}

async function main() {
  const sb = createServiceClient()
  const anthropic = new Anthropic()

  console.log('Fetching Google News RSS for "International Energy Agency"...')
  const items = await fetchFeed()
  console.log(`Got ${items.length} items from feed`)

  if (items.length === 0) {
    console.log('Empty feed — nothing to do')
    return
  }

  const urls = items.map((i) => i.url)
  const { data: existing, error: lookupErr } = await sb
    .from('iea_news')
    .select('source_url')
    .in('source_url', urls)
  if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`)
  const existingUrls = new Set(
    (existing ?? []).map((r: { source_url: string }) => r.source_url)
  )

  const newItems = items.filter((i) => !existingUrls.has(i.url))
  console.log(
    `${newItems.length} new (${items.length - newItems.length} already in DB)`
  )

  let inserted = 0
  for (const item of newItems) {
    try {
      const countryCodes = await extractCountryCodes(anthropic, item)
      // Outlet name (Reuters, Bloomberg, …) goes into topics so the UI can
      // surface it as a chip without a schema change.
      const topics = item.source ? [item.source] : []
      const { error: insertErr } = await sb.from('iea_news').upsert(
        {
          source_url: item.url,
          title: item.title,
          summary: item.summary,
          published_at: item.publishedAt,
          country_codes: countryCodes,
          topics,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'source_url' }
      )
      if (insertErr) {
        console.error(`  ✗ ${item.url}: ${insertErr.message}`)
        continue
      }
      inserted++
      console.log(
        `  ✓ [${item.source ?? '?'}] ${item.title}  →  [${
          countryCodes.join(', ') || '—'
        }]`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ ${item.url}: ${msg}`)
    }
  }

  console.log(`\nDone. Inserted ${inserted}/${newItems.length} new articles.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
