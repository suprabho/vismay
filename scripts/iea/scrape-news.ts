/**
 * IEA news scraper — pulls iea.org/rss/news, tags each new article with ISO
 * country codes via Claude, and upserts into the iea_news table.
 *
 * Run locally:  npx tsx scripts/iea/scrape-news.ts
 * Run in CI:    .github/workflows/scrape-iea-news.yml (daily cron + manual dispatch)
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write to iea_news
 *   ANTHROPIC_API_KEY                                    — country tagging
 *
 * Idempotency: source_url is the natural key (unique index in migration 015).
 * Re-running on the same feed is a no-op for already-seen URLs.
 */

import Anthropic from '@anthropic-ai/sdk'
import { JSDOM } from 'jsdom'
import { createServiceClient } from '../../lib/supabase'

const RSS_URL = 'https://www.iea.org/rss/news'

interface RssItem {
  url: string
  title: string
  summary: string | null
  publishedAt: string
}

async function fetchRss(): Promise<RssItem[]> {
  const res = await fetch(RSS_URL, {
    headers: { 'user-agent': 'vizmaya-iea-scraper/1.0 (+https://vizmaya.fyi)' },
  })
  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${res.status} ${res.statusText}`)
  }
  const xml = await res.text()
  const dom = new JSDOM(xml, { contentType: 'text/xml' })
  const items: RssItem[] = []
  for (const item of dom.window.document.querySelectorAll('item')) {
    const url = item.querySelector('link')?.textContent?.trim()
    const title = item.querySelector('title')?.textContent?.trim()
    const pubDate = item.querySelector('pubDate')?.textContent?.trim()
    const description = item.querySelector('description')?.textContent?.trim() ?? null
    if (!url || !title || !pubDate) continue
    items.push({
      url,
      title,
      summary: description,
      publishedAt: new Date(pubDate).toISOString(),
    })
  }
  return items
}

const COUNTRY_TAGGING_SYSTEM = `You extract ISO 3166-1 alpha-2 country codes from IEA news headlines.

Return ONLY country codes that are:
- Explicitly named in the headline or summary, OR
- The clear primary subject (e.g. "Japan's nuclear restart" → JP)

Empty array if the article is about:
- IEA organisational actions (reports, methodology, board appointments)
- Global aggregates ("global emissions", "world coal demand")
- Multi-region groupings with no specific country focus

Use the special code "EU" only when the European Union is explicitly named as a bloc; otherwise drop down to specific member-state codes.`

async function extractCountryCodes(
  anthropic: Anthropic,
  item: RssItem
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

  console.log('Fetching IEA RSS feed...')
  const items = await fetchRss()
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
  const existingUrls = new Set((existing ?? []).map((r: { source_url: string }) => r.source_url))

  const newItems = items.filter((i) => !existingUrls.has(i.url))
  console.log(
    `${newItems.length} new (${items.length - newItems.length} already in DB)`
  )

  let inserted = 0
  for (const item of newItems) {
    try {
      const countryCodes = await extractCountryCodes(anthropic, item)
      const { error: insertErr } = await sb.from('iea_news').upsert(
        {
          source_url: item.url,
          title: item.title,
          summary: item.summary,
          published_at: item.publishedAt,
          country_codes: countryCodes,
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
        `  ✓ ${item.title}  →  [${countryCodes.join(', ') || '—'}]`
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
