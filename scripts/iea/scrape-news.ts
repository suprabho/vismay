/**
 * IEA news scraper — discovers articles on iea.org/news (rendered via
 * Playwright Chromium because IEA's edge blocks plain `fetch` from cloud
 * IPs), extracts metadata from each article's og: tags, tags ISO country
 * codes via Claude, and upserts into iea_news.
 *
 * Run locally:  pnpm iea:scrape          (needs `pnpm exec playwright install chromium`)
 * Run in CI:    .github/workflows/scrape-iea-news.yml
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write to iea_news
 *   ANTHROPIC_API_KEY                                    — country tagging
 *
 * Idempotency: source_url is the natural key (unique index in migration 015).
 * Re-runs are no-ops for already-seen URLs.
 */

import Anthropic from '@anthropic-ai/sdk'
import { chromium, type BrowserContext } from 'playwright'
import { createServiceClient } from '../../lib/supabase'

// Real browser UA — Playwright's default contains "HeadlessChrome", which
// some bot walls (Cloudflare, Akamai) flag.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const NEWS_INDEX_URL = 'https://www.iea.org/news'

interface NewsItem {
  url: string
  title: string
  summary: string | null
  publishedAt: string
}

async function discoverArticleUrls(context: BrowserContext): Promise<string[]> {
  const page = await context.newPage()
  try {
    // `domcontentloaded` instead of `networkidle` — IEA's page has analytics
    // and lazy-load chatter that never goes idle within 60s. We only need the
    // server-rendered article cards, so wait for the anchor selector to
    // appear instead.
    await page.goto(NEWS_INDEX_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await page.waitForSelector('a[href^="/news/"]', { timeout: 30_000 })
    // Each article card on /news links to /news/<slug>. Filter to those —
    // the page also has /news (self-link), pagination, and other anchors.
    const urls = await page.$$eval('a[href^="/news/"]', (links) =>
      Array.from(
        new Set(
          links
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((h) => /\/news\/[a-z0-9-]+\/?$/.test(new URL(h).pathname))
            .map((h) => h.replace(/\/$/, ''))
        )
      )
    )
    return urls
  } finally {
    await page.close()
  }
}

async function fetchArticle(
  context: BrowserContext,
  url: string
): Promise<NewsItem | null> {
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const meta = await page.evaluate(() => {
      const attr = (sel: string) =>
        document.querySelector(sel)?.getAttribute('content') ?? null
      return {
        title:
          attr('meta[property="og:title"]') ??
          attr('meta[name="twitter:title"]') ??
          document.title,
        summary:
          attr('meta[property="og:description"]') ??
          attr('meta[name="description"]'),
        publishedAt:
          attr('meta[property="article:published_time"]') ??
          attr('meta[itemprop="datePublished"]'),
      }
    })
    if (!meta.title || !meta.publishedAt) return null
    return {
      url,
      title: meta.title.trim(),
      summary: meta.summary?.trim() ?? null,
      publishedAt: new Date(meta.publishedAt).toISOString(),
    }
  } finally {
    await page.close()
  }
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
  const browser = await chromium.launch()
  const context = await browser.newContext({ userAgent: USER_AGENT })

  try {
    console.log(`Discovering articles at ${NEWS_INDEX_URL} ...`)
    const urls = await discoverArticleUrls(context)
    console.log(`Found ${urls.length} article links on the index page`)

    if (urls.length === 0) {
      console.log('No article URLs discovered — aborting (selector may have drifted).')
      process.exitCode = 1
      return
    }

    const { data: existing, error: lookupErr } = await sb
      .from('iea_news')
      .select('source_url')
      .in('source_url', urls)
    if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`)
    const existingUrls = new Set(
      (existing ?? []).map((r: { source_url: string }) => r.source_url)
    )

    const newUrls = urls.filter((u) => !existingUrls.has(u))
    console.log(
      `${newUrls.length} new (${urls.length - newUrls.length} already in DB)`
    )

    let inserted = 0
    let skipped = 0
    for (const url of newUrls) {
      try {
        const item = await fetchArticle(context, url)
        if (!item) {
          console.warn(`  · ${url}: missing og: metadata, skipping`)
          skipped++
          continue
        }
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
          console.error(`  ✗ ${url}: ${insertErr.message}`)
          continue
        }
        inserted++
        console.log(
          `  ✓ ${item.title}  →  [${countryCodes.join(', ') || '—'}]`
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`  ✗ ${url}: ${msg}`)
      }
    }

    console.log(
      `\nDone. Inserted ${inserted}/${newUrls.length} new articles ` +
        `(${skipped} skipped for missing metadata).`
    )
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
