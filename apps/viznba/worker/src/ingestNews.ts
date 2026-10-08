/**
 * VizNBA news ingestion.
 *
 *   1. For each RSS source (sources.ts), fetch + parse
 *   2. For each item, compute url_hash; skip if already summarized / hidden
 *   3. Insert row with status='pending'
 *   4. Ask Jev for the topic (NBA or not); for NBA news, Claude Haiku writes
 *      the summary + team / player / coach names (summarise.ts)
 *   5. Resolve free-text names to canonical IDs (entityResolver.ts)
 *   6. Ask Jev, per candidate, whether it's a real subject of the article;
 *      passing mentions below the threshold are dropped (jevEntityGate.ts)
 *   7. Link viznba_article_entities, then mark the row summarized
 *
 * Rows left `pending` / `failed` by an earlier run are retried when their URL
 * shows up in a feed again. Each article swallows its own errors, so the run
 * ends with a health check: it exits non-zero when every feed failed, or when
 * there was new work and none of it summarised — otherwise a run where the
 * gateway was down for every call would look green in CI.
 *
 * Prerequisite: `pnpm seed:roster` has filled viznba_teams / players / coaches.
 *
 * Run via: `pnpm --filter @viznba/worker ingest:news`
 * In CI:   .github/workflows/viznba-ingest-news.yml
 */

import crypto from 'node:crypto'
import Parser from 'rss-parser'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabase'
import { RSS_SOURCES, type RssSource } from './sources'
import { summariseAndTag } from './summarise'
import { resolveEntities } from './entityResolver'
import { gateEntityTags } from './jevEntityGate'

type FeedItem = Parser.Item & {
  contentEncoded?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mediaContent?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mediaThumbnail?: any
}

const parser: Parser<object, FeedItem> = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; VizNBA/1.0)',
    Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  },
  timeout: 15000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
})

/** What Claude sees. Full-text feeds run long; the summary needs the lede. */
const MAX_BODY_CHARS = 12000

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex')
}

/** Collapse feed whitespace — CBS and FOX wrap titles in newlines + tabs. */
function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
}

/** Feed HTML → plain text for the models. Not a sanitiser: never rendered. */
export function htmlToText(html: string): string {
  return clean(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m),
  )
}

export function extractImage(item: FeedItem): string | null {
  if (item.enclosure?.url && (!item.enclosure.type || item.enclosure.type.startsWith('image'))) {
    return item.enclosure.url
  }
  const mc = item.mediaContent
  if (Array.isArray(mc) && mc.length > 0) {
    const best = mc
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => ({ url: m?.$?.url, width: parseInt(m?.$?.width ?? '0', 10) }))
      .filter((m) => m.url)
      .sort((a, b) => b.width - a.width)[0]
    if (best?.url) return best.url
  }
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url
  const html = item.contentEncoded ?? item.content ?? ''
  return html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null
}

type Stats = {
  fetched: number
  new: number
  retried: number
  summarized: number
  hidden: number
  errors: number
  tagged: number
  tagsDropped: number
  sourceFailures: number
}

const emptyStats = (): Stats => ({
  fetched: 0,
  new: 0,
  retried: 0,
  summarized: 0,
  hidden: 0,
  errors: 0,
  tagged: 0,
  tagsDropped: 0,
  sourceFailures: 0,
})

type Candidate = { headline: string; body: string; url: string }

/** Steps 4-7 for one row. Never throws — failures land on the row. */
async function processArticle(
  sb: SupabaseClient,
  source: RssSource,
  articleId: string,
  article: Candidate,
  stats: Stats,
): Promise<void> {
  try {
    const result = await summariseAndTag({
      headline: article.headline,
      body: article.body,
      publisher: source.publisher,
    })
    const summaryAt = new Date().toISOString()

    if (!result.is_nba_news) {
      const { error } = await sb
        .from('viznba_articles')
        .update({
          summary: result.summary,
          summary_model: result.summary_model,
          summary_at: summaryAt,
          status: 'hidden',
          failure_reason: `not_nba:${result.topic_category}`,
          topic_category: result.topic_category,
        })
        .eq('id', articleId)
      if (error) throw new Error(`hide update: ${error.message}`)
      stats.hidden++
      return
    }

    const resolved = await resolveEntities(sb, result.entities)
    const gated = await gateEntityTags(
      { headline: article.headline, body: article.body, publisher: source.publisher },
      resolved,
    )
    const kept = gated.filter((e) => e.kept)
    for (const e of gated) {
      if (!e.kept) {
        console.log(
          `[jev-gate] dropped ${e.type} ${JSON.stringify(e.name)} (p=${e.confidence.toFixed(2)}) on ${article.url}`,
        )
      }
    }
    stats.tagsDropped += gated.length - kept.length
    stats.tagged += kept.length

    // Tags first, status second: a row only reads `summarized` once its tags
    // are in. Upsert, because a retried row may carry tags from a run that
    // died between these two writes.
    if (kept.length > 0) {
      const { error } = await sb.from('viznba_article_entities').upsert(
        kept.map((e) => ({
          article_id: articleId,
          entity_type: e.type,
          entity_id: e.id,
          confidence: e.confidence,
        })),
        { onConflict: 'article_id,entity_type,entity_id' },
      )
      if (error) throw new Error(`entity link: ${error.message}`)
    }

    const { error } = await sb
      .from('viznba_articles')
      .update({
        summary: result.summary,
        summary_model: result.summary_model,
        summary_at: summaryAt,
        status: 'summarized',
        failure_reason: null,
        topic_category: result.topic_category,
      })
      .eq('id', articleId)
    if (error) throw new Error(`summary update: ${error.message}`)
    stats.summarized++
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[${source.id}] processing failed for ${article.url}:`, msg)
    await sb
      .from('viznba_articles')
      .update({ status: 'failed', failure_reason: msg.slice(0, 500) })
      .eq('id', articleId)
    stats.errors++
  }
}

async function ingestSource(sb: SupabaseClient, source: RssSource): Promise<Stats> {
  const stats = emptyStats()

  let feed
  try {
    feed = await parser.parseURL(source.feedUrl)
  } catch (e) {
    console.error(`[${source.id}] feed fetch failed:`, e instanceof Error ? e.message : e)
    stats.sourceFailures++
    return stats
  }
  stats.fetched = feed.items.length

  for (const item of feed.items) {
    const url = item.link?.trim()
    // Titles arrive entity-encoded ("Dundon: &#39;My intention…") and are
    // stored + rendered as-is, so decode them like the body.
    const headline = item.title ? htmlToText(item.title) : ''
    if (!url || !headline) continue
    const urlHash = hashUrl(url)

    const rawBody = item.contentEncoded ?? item.content ?? item.contentSnippet ?? ''
    const body = htmlToText(rawBody).slice(0, MAX_BODY_CHARS) || headline
    const candidate = { headline, body, url }

    const { data: existing, error: lookupError } = await sb
      .from('viznba_articles')
      .select('id, status')
      .eq('url_hash', urlHash)
      .maybeSingle()
    if (lookupError) {
      console.error(`[${source.id}] lookup failed for ${url}:`, lookupError.message)
      stats.errors++
      continue
    }

    if (existing) {
      if (existing.status === 'summarized' || existing.status === 'hidden') continue
      stats.retried++
      await processArticle(sb, source, existing.id, candidate, stats)
      continue
    }

    const snippet = item.contentSnippet ? htmlToText(item.contentSnippet).slice(0, 1000) : null
    const { data: inserted, error: insertError } = await sb
      .from('viznba_articles')
      .insert({
        url,
        url_hash: urlHash,
        source_id: source.id,
        publisher: source.publisher,
        headline,
        original_snippet: snippet,
        image_url: extractImage(item),
        published_at: item.isoDate ?? new Date().toISOString(),
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error(`[${source.id}] insert failed for ${url}:`, insertError?.message)
      stats.errors++
      continue
    }
    stats.new++
    await processArticle(sb, source, inserted.id, candidate, stats)
  }

  return stats
}

/** Non-null when the run should exit non-zero. */
export function ingestFailureReason(totals: Stats, sourceCount: number): string | null {
  if (totals.sourceFailures === sourceCount) return 'every feed failed to fetch'
  const attempted = totals.new + totals.retried
  if (attempted > 0 && totals.summarized === 0 && totals.hidden === 0) {
    return `${attempted} article(s) to process and none summarised or classified`
  }
  return null
}

const fmt = (s: Stats) =>
  Object.entries(s)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')

export async function runIngestion(): Promise<Stats> {
  const sb = getSupabase()
  console.log(`[ingest:news] starting at ${new Date().toISOString()}`)
  const totals = emptyStats()
  for (const source of RSS_SOURCES) {
    const stats = await ingestSource(sb, source)
    console.log(`[${source.id}] ${fmt(stats)}`)
    for (const k of Object.keys(totals) as Array<keyof Stats>) totals[k] += stats[k]
  }
  console.log(`[ingest:news] done: ${fmt(totals)}`)

  const reason = ingestFailureReason(totals, RSS_SOURCES.length)
  if (reason) throw new Error(`[ingest:news] unhealthy run: ${reason}`)
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
