/**
 * VizF1 news ingestion.
 *
 * Mirrors apps/footshort/worker/src/ingest.ts:
 *   1. For each RSS source, fetch + parse
 *   2. For each item, compute url_hash; skip if already in DB
 *   3. Insert row with status='pending'
 *   4. Call Gemini for summary + entities
 *   5. Resolve free-text entities to canonical IDs
 *   6. Update row with summary + link article_entities
 *
 * Run via: `pnpm --filter @vizf1/worker ingest:news`
 * In CI:   .github/workflows/vizf1-ingest-news.yml (daily 06:15 UTC)
 */

import crypto from 'node:crypto'
import Parser from 'rss-parser'
import { getSupabase } from './supabase'
import { RSS_SOURCES, type RssSource } from './sources'
import { summariseAndTag, GEMINI_MODEL } from './gemini'
import { resolveEntities } from './entityResolver'

const parser = new Parser({
  headers: { 'User-Agent': 'VizF1/1.0 (+https://vizf1.app)' },
  timeout: 10000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
    ],
  },
})

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex')
}

export function extractImage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: Parser.Item & Record<string, any>,
): string | null {
  if (item.enclosure?.url) return item.enclosure.url
  const mc = item.mediaContent
  if (Array.isArray(mc) && mc.length > 0) {
    const best = mc
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => ({ url: m?.$?.url, width: parseInt(m?.$?.width ?? '0', 10) }))
      .filter((m) => m.url)
      .sort((a, b) => b.width - a.width)[0]
    if (best?.url) return best.url
  } else if (mc?.$?.url) {
    return mc.$.url
  }
  const mt = item.mediaThumbnail
  if (mt?.$?.url) {
    return String(mt.$.url).replace(/\/ace\/standard\/\d+\//, '/ace/standard/976/')
  }
  const html = item.content ?? ''
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match?.[1] ?? null
}

type Stats = { fetched: number; new: number; hidden: number; errors: number }

async function ingestSource(
  sb: ReturnType<typeof getSupabase>,
  source: RssSource,
): Promise<Stats> {
  const stats: Stats = { fetched: 0, new: 0, hidden: 0, errors: 0 }

  let feed
  try {
    feed = await parser.parseURL(source.feedUrl)
  } catch (e) {
    console.error(`[${source.id}] feed fetch failed:`, e)
    return stats
  }
  stats.fetched = feed.items.length

  for (const item of feed.items) {
    if (!item.link || !item.title) continue
    const urlHash = hashUrl(item.link)

    const { data: existing } = await sb
      .from('articles')
      .select('id')
      .eq('url_hash', urlHash)
      .maybeSingle()
    if (existing) continue

    const imageUrl = extractImage(item)

    const { data: inserted, error: insertError } = await sb
      .from('articles')
      .insert({
        url: item.link,
        url_hash: urlHash,
        publisher: source.publisher,
        headline: item.title,
        original_snippet: item.contentSnippet ?? item.content ?? null,
        image_url: imageUrl,
        published_at: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error(`[${source.id}] insert failed for ${item.link}:`, insertError)
      stats.errors++
      continue
    }
    stats.new++

    try {
      const body = item.content ?? item.contentSnippet ?? item.title
      const gemini = await summariseAndTag({
        headline: item.title,
        body,
        publisher: source.publisher,
      })

      const summaryAt = new Date().toISOString()
      const summaryModel = GEMINI_MODEL

      if (!gemini.is_f1_news) {
        await sb
          .from('articles')
          .update({
            summary: gemini.summary,
            summary_model: summaryModel,
            summary_at: summaryAt,
            status: 'hidden',
            failure_reason: `not_f1:${gemini.topic_category}`,
            topic_category: gemini.topic_category,
          })
          .eq('id', inserted.id)
        stats.hidden++
        continue
      }

      const entities = await resolveEntities(sb, gemini.entities)

      await sb
        .from('articles')
        .update({
          summary: gemini.summary,
          summary_model: summaryModel,
          summary_at: summaryAt,
          status: 'summarized',
          topic_category: gemini.topic_category,
        })
        .eq('id', inserted.id)

      if (entities.length > 0) {
        await sb.from('article_entities').insert(
          entities.map((e) => ({
            article_id: inserted.id,
            entity_type: e.entity_type,
            entity_id: e.entity_id,
          })),
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[${source.id}] summarisation failed for ${item.link}:`, msg)
      await sb
        .from('articles')
        .update({ status: 'failed', failure_reason: msg.slice(0, 500) })
        .eq('id', inserted.id)
      stats.errors++
    }
  }

  return stats
}

export async function runIngestion() {
  const sb = getSupabase()
  console.log(`[ingest:news] starting at ${new Date().toISOString()}`)
  const totals: Stats = { fetched: 0, new: 0, hidden: 0, errors: 0 }
  for (const source of RSS_SOURCES) {
    const stats = await ingestSource(sb, source)
    console.log(
      `[${source.id}] fetched=${stats.fetched} new=${stats.new} hidden=${stats.hidden} errors=${stats.errors}`,
    )
    totals.fetched += stats.fetched
    totals.new += stats.new
    totals.hidden += stats.hidden
    totals.errors += stats.errors
  }
  console.log(
    `[ingest:news] done: fetched=${totals.fetched} new=${totals.new} hidden=${totals.hidden} errors=${totals.errors}`,
  )
  return totals
}

if (require.main === module) {
  runIngestion()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('fatal:', e)
      process.exit(1)
    })
}
