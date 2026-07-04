/**
 * Generalized epic content pipelines — the admin-facing layer over each
 * epic's ingestion feeds (news scrapes, relevance gates, recap workers,
 * market data).
 *
 * Each epic with a live pipeline registers an adapter here that normalizes
 * its bespoke tables into a shared shape, so the admin Pipeline and Recaps
 * tabs can render one merged, epic-tagged view instead of a page per epic.
 * The per-epic readers stay next to their tables (epics.ts); this module
 * only maps and merges.
 *
 * Current adapters:
 *   * ai-data-centers — dc_news / dc_news_recaps / dc_stocks (migrations
 *     065–066): scraped news behind a Gemma relevance gate, daily recap
 *     snapshots, and a related-stock price feed. Tags are dc_stocks tickers.
 *   * energy-profile  — iea_news (migration 015): scraped energy news, no
 *     relevance gate or recap worker. Tags are ISO country codes.
 */

import { createServiceClient } from './supabase'
import {
  getDcPipelineStats,
  listDcNewsForAdmin,
  listDcNewsRecaps,
  type DcNewsRecap,
} from './epics'

export interface PipelineEpicMeta {
  epicSlug: string
  epicName: string
  appSlug: string
  /** One-line description of the ingestion flow, shown on the epic's health card. */
  flow: string
  /** What the epic's secondary tag group is (dc tickers, iea country codes). */
  tagLabel: string
  hasRelevanceGate: boolean
  hasRecaps: boolean
  hasStocks: boolean
}

export interface PipelineNewsItem {
  /** `${epicSlug}:${row id}` — unique across the merged feed. */
  key: string
  epicSlug: string
  url: string
  title: string
  summary: string | null
  /** Outlet name; null for feeds that don't record one (iea_news). */
  source: string | null
  publishedAt: string
  /** Always true for epics without a relevance gate. */
  relevant: boolean
  topics: string[]
  /** Secondary tag group — see PipelineEpicMeta.tagLabel. */
  tags: string[]
}

export interface PipelineRecap {
  /** `${epicSlug}:${row id}` — unique across the merged timeline. */
  key: string
  epicSlug: string
  windowHours: number
  /** LLM one-liner; null when the recap is deterministic-only. */
  headline: string | null
  markdown: string
  model: string | null
  articleCount: number
  topics: string[]
  tags: string[]
  generatedAt: string
}

export interface PipelineDayBucket {
  /** UTC calendar day, YYYY-MM-DD. */
  day: string
  relevant: number
  rejected: number
}

export interface PipelineEpicHealth {
  news: {
    total: number
    relevant: number
    rejected: number
    /** Relevant stories published in the trailing 24h / 7d. */
    relevant24h: number
    relevant7d: number
    latestFetchedAt: string | null
    /** Last 14 UTC days by published_at, oldest first, zero-filled. */
    byDay: PipelineDayBucket[]
    /** Relevant stories in the last 30d per topic / tag, biggest first. */
    byTopic: { key: string; count: number }[]
    byTag: { key: string; count: number }[]
  }
  /** Null for epics without a recap worker. */
  recaps: { total: number; latest: PipelineRecap | null } | null
  /** Null for epics without a market feed. */
  stocks: { activeTickers: number; latestTradeDate: string | null; tickersFresh7d: number } | null
}

export interface PipelineOverviewEntry {
  meta: PipelineEpicMeta
  /** Null when the epic's tables errored (e.g. migration not applied yet). */
  health: PipelineEpicHealth | null
  error: string | null
}

export interface PipelineNewsQuery {
  /** Scope to one registered epic; omit for the merged feed. */
  epic?: string
  limit?: number
  topic?: string
  tag?: string
  /** Case-insensitive substring match on the title. */
  q?: string
  relevance?: 'all' | 'relevant' | 'rejected'
}

export interface PipelineEpicError {
  epicSlug: string
  message: string
}

export interface PipelineNewsResult {
  news: PipelineNewsItem[]
  /** Epics whose query failed — the merged feed still carries the rest. */
  errors: PipelineEpicError[]
}

export interface PipelineRecapsResult {
  recaps: PipelineRecap[]
  errors: PipelineEpicError[]
}

const DAY_MS = 86_400_000

// ---------------------------------------------------------------------------
// AI Data Centers adapter — maps the dc_* readers in epics.ts.

const DC_SLUG = 'ai-data-centers'

function mapDcRecap(r: DcNewsRecap): PipelineRecap {
  return {
    key: `${DC_SLUG}:${r.id}`,
    epicSlug: DC_SLUG,
    windowHours: r.windowHours,
    headline: r.headline,
    markdown: r.markdown,
    model: r.model,
    articleCount: r.articleCount,
    topics: r.topics,
    tags: r.tickers,
    generatedAt: r.generatedAt,
  }
}

async function dcHealth(): Promise<PipelineEpicHealth> {
  const stats = await getDcPipelineStats()
  return {
    news: {
      total: stats.news.total,
      relevant: stats.news.relevant,
      rejected: stats.news.rejected,
      relevant24h: stats.news.relevant24h,
      relevant7d: stats.news.relevant7d,
      latestFetchedAt: stats.news.latestFetchedAt,
      byDay: stats.news.byDay,
      byTopic: stats.news.byTopic.map((t) => ({ key: t.topic, count: t.count })),
      byTag: stats.news.byTicker.map((t) => ({ key: t.ticker, count: t.count })),
    },
    recaps: {
      total: stats.recaps.total,
      latest: stats.recaps.latest ? mapDcRecap(stats.recaps.latest) : null,
    },
    stocks: {
      activeTickers: stats.stocks.activeTickers,
      latestTradeDate: stats.stocks.latestTradeDate,
      tickersFresh7d: stats.stocks.tickersFresh7d,
    },
  }
}

async function dcNews(opts: Omit<PipelineNewsQuery, 'epic'>): Promise<PipelineNewsItem[]> {
  const rows = await listDcNewsForAdmin({
    limit: opts.limit,
    topic: opts.topic,
    ticker: opts.tag,
    q: opts.q,
    relevance: opts.relevance,
  })
  return rows.map((r) => ({
    key: `${DC_SLUG}:${r.id}`,
    epicSlug: DC_SLUG,
    url: r.url,
    title: r.title,
    summary: r.summary,
    source: r.source,
    publishedAt: r.publishedAt,
    relevant: r.relevant,
    topics: r.topics,
    tags: r.tickers,
  }))
}

async function dcRecaps(limit: number): Promise<PipelineRecap[]> {
  return (await listDcNewsRecaps(limit)).map(mapDcRecap)
}

// ---------------------------------------------------------------------------
// Energy Profile adapter — reads iea_news directly (migration 015). The feed
// has no relevance gate, recap worker, or market feed, so those blocks are
// null and every item reads as relevant.

const IEA_SLUG = 'energy-profile'

// Escape LIKE wildcards so a literal "%" in the search box doesn't match everything.
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, '\\$&')
}

async function ieaNews(opts: Omit<PipelineNewsQuery, 'epic'>): Promise<PipelineNewsItem[]> {
  // No gate means no rejected rows to audit.
  if (opts.relevance === 'rejected') return []
  const sb = createServiceClient()
  let query = sb
    .from('iea_news')
    .select('id, source_url, title, summary, published_at, country_codes, topics')
    .order('published_at', { ascending: false })
    .limit(opts.limit ?? 50)
  if (opts.topic) query = query.contains('topics', [opts.topic])
  if (opts.tag) query = query.contains('country_codes', [opts.tag])
  if (opts.q) query = query.ilike('title', `%${escapeLike(opts.q)}%`)
  const { data, error } = await query
  if (error) throw new Error(`ieaNews: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    key: `${IEA_SLUG}:${r.id}`,
    epicSlug: IEA_SLUG,
    url: r.source_url as string,
    title: r.title as string,
    summary: (r.summary as string | null) ?? null,
    source: null,
    publishedAt: r.published_at as string,
    relevant: true,
    topics: (r.topics as string[]) ?? [],
    tags: (r.country_codes as string[]) ?? [],
  }))
}

async function ieaHealth(): Promise<PipelineEpicHealth> {
  const sb = createServiceClient()
  const now = Date.now()
  const cutoff30d = new Date(now - 30 * DAY_MS).toISOString()

  const [totalR, recentR, latestFetchR] = await Promise.all([
    sb.from('iea_news').select('id', { count: 'exact', head: true }),
    sb
      .from('iea_news')
      .select('published_at, topics, country_codes')
      .gte('published_at', cutoff30d)
      .limit(5_000),
    sb.from('iea_news').select('fetched_at').order('fetched_at', { ascending: false }).limit(1),
  ])
  for (const [label, r] of [
    ['total', totalR],
    ['recent', recentR],
    ['latestFetch', latestFetchR],
  ] as const) {
    if (r.error) throw new Error(`ieaHealth ${label}: ${r.error.message}`)
  }

  // Zero-filled 14-day scaffold so the volume chart shows quiet days too.
  const byDayMap = new Map<string, PipelineDayBucket>()
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now - i * DAY_MS).toISOString().slice(0, 10)
    byDayMap.set(day, { day, relevant: 0, rejected: 0 })
  }
  const topicCounts = new Map<string, number>()
  const tagCounts = new Map<string, number>()
  let relevant24h = 0
  let relevant7d = 0
  const recent = (recentR.data ?? []) as {
    published_at: string
    topics: string[] | null
    country_codes: string[] | null
  }[]
  for (const row of recent) {
    const ts = Date.parse(row.published_at)
    const bucket = byDayMap.get(row.published_at.slice(0, 10))
    if (bucket) bucket.relevant += 1
    if (now - ts <= DAY_MS) relevant24h += 1
    if (now - ts <= 7 * DAY_MS) relevant7d += 1
    for (const t of row.topics ?? []) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1)
    for (const t of row.country_codes ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  }
  const descending = (a: { count: number }, b: { count: number }) => b.count - a.count

  const total = totalR.count ?? 0
  return {
    news: {
      total,
      relevant: total,
      rejected: 0,
      relevant24h,
      relevant7d,
      latestFetchedAt: (latestFetchR.data?.[0]?.fetched_at as string | undefined) ?? null,
      byDay: [...byDayMap.values()],
      byTopic: [...topicCounts].map(([key, count]) => ({ key, count })).sort(descending),
      byTag: [...tagCounts].map(([key, count]) => ({ key, count })).sort(descending),
    },
    recaps: null,
    stocks: null,
  }
}

// ---------------------------------------------------------------------------
// Registry.

interface EpicPipelineAdapter {
  meta: PipelineEpicMeta
  health(): Promise<PipelineEpicHealth>
  news(opts: Omit<PipelineNewsQuery, 'epic'>): Promise<PipelineNewsItem[]>
  recaps?(limit: number): Promise<PipelineRecap[]>
}

const ADAPTERS: EpicPipelineAdapter[] = [
  {
    meta: {
      epicSlug: DC_SLUG,
      epicName: 'AI Data Centers',
      appSlug: 'vizmaya-fyi',
      flow: 'Google News scrape 06:45 → Gemma relevance gate → recap worker 08:15 · stock feed 22:45 UTC',
      tagLabel: 'tickers',
      hasRelevanceGate: true,
      hasRecaps: true,
      hasStocks: true,
    },
    health: dcHealth,
    news: dcNews,
    recaps: dcRecaps,
  },
  {
    meta: {
      epicSlug: IEA_SLUG,
      epicName: 'Energy Profile',
      appSlug: 'vizmaya-fyi',
      flow: 'Energy news scrape 06:15 UTC, tagged by country + topic (no relevance gate or recap worker)',
      tagLabel: 'countries',
      hasRelevanceGate: false,
      hasRecaps: false,
      hasStocks: false,
    },
    health: ieaHealth,
    news: ieaNews,
  },
]

export const PIPELINE_EPICS: PipelineEpicMeta[] = ADAPTERS.map((a) => a.meta)

export function getPipelineEpic(slug: string): PipelineEpicMeta | null {
  return PIPELINE_EPICS.find((m) => m.epicSlug === slug) ?? null
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Health snapshot for every registered epic pipeline. Failures are captured
 * per epic (entry.error) so one missing migration doesn't blank the page for
 * the epics that are fine.
 */
export async function getPipelineOverview(): Promise<PipelineOverviewEntry[]> {
  return Promise.all(
    ADAPTERS.map(async (a): Promise<PipelineOverviewEntry> => {
      try {
        return { meta: a.meta, health: await a.health(), error: null }
      } catch (e) {
        return { meta: a.meta, health: null, error: toMessage(e) }
      }
    }),
  )
}

/**
 * Merged, epic-tagged news feed across the registered pipelines (or one epic
 * via opts.epic). Each epic is queried with the shared filters, then the
 * results interleave by published_at and trim to the limit.
 */
export async function listPipelineNews(opts: PipelineNewsQuery = {}): Promise<PipelineNewsResult> {
  const targets = opts.epic ? ADAPTERS.filter((a) => a.meta.epicSlug === opts.epic) : ADAPTERS
  const limit = opts.limit ?? 50
  const errors: PipelineEpicError[] = []
  const perEpic = await Promise.all(
    targets.map(async (a) => {
      try {
        return await a.news({ ...opts, limit })
      } catch (e) {
        errors.push({ epicSlug: a.meta.epicSlug, message: toMessage(e) })
        return []
      }
    }),
  )
  const news = perEpic
    .flat()
    .sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt))
    .slice(0, limit)
  return { news, errors }
}

/**
 * Merged recap-snapshot timeline across every epic with a recap worker
 * (currently just ai-data-centers), newest first.
 */
export async function listPipelineRecaps(
  opts: { epic?: string; limit?: number } = {},
): Promise<PipelineRecapsResult> {
  const targets = (
    opts.epic ? ADAPTERS.filter((a) => a.meta.epicSlug === opts.epic) : ADAPTERS
  ).filter((a) => a.recaps)
  const limit = opts.limit ?? 20
  const errors: PipelineEpicError[] = []
  const perEpic = await Promise.all(
    targets.map(async (a) => {
      try {
        return await a.recaps!(limit)
      } catch (e) {
        errors.push({ epicSlug: a.meta.epicSlug, message: toMessage(e) })
        return []
      }
    }),
  )
  const recaps = perEpic
    .flat()
    .sort((x, y) => Date.parse(y.generatedAt) - Date.parse(x.generatedAt))
    .slice(0, limit)
  return { recaps, errors }
}
