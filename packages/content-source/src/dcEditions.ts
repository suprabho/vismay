/**
 * AI Data Centers daily snapshot — readers and writers.
 *
 * Tables dc_editions / dc_papers / dc_places plus the tag columns on dc_news
 * (migration 078). Both apps read through here: the public
 * /ai-daily/doom-v-boom routes, the admin Editions tab, and the pipeline
 * scripts (compose-edition.ts, publish-edition.ts, ingest-papers.ts).
 *
 * Invariant: a published row is never updated (a DB trigger enforces it). The
 * page renders from the row plus the rows its membership arrays name, never
 * by re-querying the window, so later re-classification or deletion in
 * dc_news cannot change a published edition.
 *
 * Server only — imports the service Supabase client. Client components take
 * types and vocabularies from ./dcEditionTypes.
 */

import { createHash } from 'node:crypto'
import { createServiceClient, isMissingColumnError } from './supabase'
import { normaliseCharts, normaliseChartSkips, pruneChartsForMembership } from './dcEditionCharts'
import {
  DC_FIGURE_SCOPES,
  DC_FIGURE_STATUSES,
  EDITION_CHART_SECTIONS,
  DC_LAYER_KEYS,
  EDITION_HOLD_MINUTES,
  MOOD_METHOD,
  editionDateFor,
  editionPublishAt,
  editionWindow,
  emptyCounts,
  emptyEnergy,
  emptyGeo,
  emptyLayers,
  emptyMoodCounts,
  emptyResearch,
  formatEditionDayLabel,
  type DcEdition,
  type DcEditionNeighbours,
  type DcEditionStory,
  type DcEditionSummary,
  type DcEditionWithContent,
  type DcLayerKey,
  type DcMood,
  type DcPaper,
  type DcPaperArea,
  type DcPlace,
  type DcRegionKey,
  type DcFigureScope,
  type DcFigureStatus,
  type DcStoryFacts,
  type DcStoryFigure,
  type DcThemeKey,
  type EditionChartSkip,
  type EditionCharts,
  type EditionComposerRun,
  type EditionCounts,
  type EditionEnergy,
  type EditionGeo,
  type EditionLayer,
  type EditionLayerNote,
  type EditionMoodCounts,
  type EditionMoodPoint,
  type EditionNote,
  type EditionResearch,
  type EditionSource,
  type EditionTapeTick,
  type EditionText,
} from './dcEditionTypes'
import {
  EDITABLE_PATH_RE,
  buildCounts,
  buildEnergy,
  buildGeo,
  buildLayerViz,
  buildIdf,
  buildTape,
  decimalYear,
  fieldBaseline,
  flattenText,
  powerCommitted,
  scoreMoodEvents,
  type StockName,
} from './dcEditionAssembly'

type Sb = ReturnType<typeof createServiceClient>

// ---------------------------------------------------------------------------
// Column lists + row mappers

/** The tag columns before classifier v4 — reads fall back to these until migration 080 is applied. */
const DC_NEWS_TAGGED_COLUMNS_V3 =
  'id, source_url, title, summary, source, published_at, topics, tickers, ' +
  'layer, place, region, theme, mood, energy, facts'

/** v4 adds the Doom v Boom grades and the event line + actors the clustering reads (migration 080). */
export const DC_NEWS_TAGGED_COLUMNS = `${DC_NEWS_TAGGED_COLUMNS_V3}, relevance, impact, event, actors`

/**
 * Run a dc_news read with the v4 columns, retrying with the v3 list when the
 * code is deployed ahead of migration 080: the edition then scores ungraded
 * events (weight as 3/3) instead of failing to render.
 */
async function withTaggedColumns<T>(run: (cols: string) => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>) {
  let res = await run(DC_NEWS_TAGGED_COLUMNS)
  if (res.error && isMissingColumnError(res.error)) res = await run(DC_NEWS_TAGGED_COLUMNS_V3)
  return res
}

/** PostgREST `max_rows` ceiling — a select returns at most this many rows whatever `.limit()` asks for. */
const DC_NEWS_PAGE_SIZE = 1000
/** Hard stop on paging (20k rows), so a runaway table can't hang a compose. */
const DC_NEWS_MAX_PAGES = 20

/**
 * Every relevant tagged dc_news row in [start, end), paged past max_rows.
 * 30 days of the feed is ~4k rows; a single `.limit(5000)` silently returned
 * an arbitrary 1,000 of them, so the clustering IDF and the re-scored history
 * days saw a quarter of the month.
 */
async function listDcNewsTaggedAll(start: string, end: string): Promise<{ data: unknown[]; error: { message: string } | null }> {
  const sb = createServiceClient()
  const rows: unknown[] = []
  for (let page = 0; page < DC_NEWS_MAX_PAGES; page++) {
    const { data, error } = await withTaggedColumns((cols) =>
      sb
        .from('dc_news')
        .select(cols)
        .eq('relevant', true)
        .gte('published_at', start)
        .lt('published_at', end)
        // Stable order so pages neither skip nor repeat rows.
        .order('published_at', { ascending: true })
        .order('id', { ascending: true })
        .range(rows.length, rows.length + DC_NEWS_PAGE_SIZE - 1),
    )
    if (error) return { data: rows, error }
    const batch = (data ?? []) as unknown[]
    if (batch.length === 0) break
    rows.push(...batch)
  }
  return { data: rows, error: null }
}

const PAPER_COLUMNS =
  'arxiv_id, title, abstract, authors, affiliations, kind, category, area, bench, baseline, result, ' +
  'unit, compute_bucket, scale, weights_released, code_released, why, tags, importance, relevant, published_at'

const EDITION_SUMMARY_COLUMNS = 'id, number, edition_date, status, headline, sub, counts, mood_score, published_at'
const EDITION_COLUMNS =
  `${EDITION_SUMMARY_COLUMNS}, window_start, window_end, notes, mood_counts, mood_series, layers, research, ` +
  'energy, geo, tape, charts, chart_skips, story_ids, paper_ids, iea_ids, model, classifier_version, composer_runs, edited_fields, ' +
  'auto_publish_at, hold_count, generated_at, reviewed_by'

function normaliseFacts(raw: unknown): DcStoryFacts | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const figures = Array.isArray(r.figures)
    ? r.figures
        .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
        .map((f) => {
          const fig: DcStoryFigure = {
            value: Number(f.value),
            unit: typeof f.unit === 'string' ? f.unit : '',
            label: typeof f.label === 'string' ? f.label : '',
          }
          // v3 tags — optional so v2 rows keep their shape.
          if (typeof f.subject === 'string' && f.subject) fig.subject = f.subject
          if (typeof f.scope === 'string' && (DC_FIGURE_SCOPES as string[]).includes(f.scope)) fig.scope = f.scope as DcFigureScope
          if (typeof f.status === 'string' && (DC_FIGURE_STATUSES as string[]).includes(f.status)) fig.status = f.status as DcFigureStatus
          if (typeof f.base === 'number' && Number.isFinite(f.base)) fig.base = f.base
          if (typeof f.confidence === 'number' && Number.isFinite(f.confidence)) fig.confidence = f.confidence
          return fig
        })
        .filter((f) => Number.isFinite(f.value))
    : []
  const h = r.horizon && typeof r.horizon === 'object' ? (r.horizon as Record<string, unknown>) : null
  const horizon =
    h && (typeof h.from === 'string' || typeof h.to === 'string')
      ? { from: typeof h.from === 'string' && h.from ? h.from : null, to: typeof h.to === 'string' && h.to ? h.to : null }
      : null
  return {
    action: typeof r.action === 'string' && r.action ? (r.action as DcStoryFacts['action']) : null,
    figures,
    horizon,
  }
}

export function mapDcStoryRow(r: any, kind: 'news' | 'iea' = 'news'): DcEditionStory {
  return {
    id: Number(r.id),
    url: r.source_url as string,
    title: r.title as string,
    summary: (r.summary as string | null) ?? null,
    source: (r.source as string | null) ?? (kind === 'iea' ? 'IEA' : null),
    publishedAt: r.published_at as string,
    topics: (r.topics as string[]) ?? [],
    tickers: (r.tickers as string[]) ?? [],
    layer: (r.layer as DcLayerKey | null) ?? null,
    place: (r.place as string | null) ?? null,
    region: (r.region as DcRegionKey | null) ?? null,
    theme: (r.theme as DcThemeKey | null) ?? null,
    mood: r.mood == null ? null : (Number(r.mood) as DcMood),
    energy: kind === 'iea' ? true : Boolean(r.energy),
    facts: normaliseFacts(r.facts),
    kind,
    relevance: r.relevance == null ? null : Number(r.relevance),
    impact: r.impact == null ? null : Number(r.impact),
    event: typeof r.event === 'string' && r.event.trim() ? r.event.trim() : null,
    actors: Array.isArray(r.actors) ? (r.actors as unknown[]).filter((a): a is string => typeof a === 'string' && !!a.trim()) : [],
  }
}

function mapPaperRow(r: any): DcPaper {
  return {
    arxivId: r.arxiv_id as string,
    title: r.title as string,
    abstract: (r.abstract as string | null) ?? null,
    authors: (r.authors as string | null) ?? null,
    affiliations: (r.affiliations as string | null) ?? null,
    kind: (r.kind as DcPaper['kind']) ?? null,
    category: (r.category as string | null) ?? null,
    area: (r.area as DcPaperArea | null) ?? null,
    bench: (r.bench as string | null) ?? null,
    baseline: r.baseline == null ? null : Number(r.baseline),
    result: r.result == null ? null : Number(r.result),
    unit: (r.unit as string | null) ?? null,
    computeBucket: r.compute_bucket == null ? null : Number(r.compute_bucket),
    scale: (r.scale as string | null) ?? null,
    weightsReleased: Boolean(r.weights_released),
    codeReleased: Boolean(r.code_released),
    why: (r.why as string | null) ?? null,
    tags: (r.tags as string[]) ?? [],
    importance: r.importance == null ? null : Number(r.importance),
    relevant: r.relevant !== false,
    publishedAt: r.published_at as string,
  }
}

function mapPlaceRow(r: any): DcPlace {
  return {
    slug: r.slug as string,
    name: r.name as string,
    region: r.region as DcRegionKey,
    lat: Number(r.lat),
    lng: Number(r.lng),
    aliases: (r.aliases as string[]) ?? [],
  }
}

function normaliseLayers(raw: unknown): Record<DcLayerKey, EditionLayer> {
  const out = emptyLayers()
  if (!raw || typeof raw !== 'object') return out
  for (const k of DC_LAYER_KEYS) {
    const l = (raw as Record<string, unknown>)[k]
    if (!l || typeof l !== 'object') continue
    const v = l as Record<string, unknown>
    out[k] = {
      headline: typeof v.headline === 'string' ? v.headline : '',
      sub: typeof v.sub === 'string' ? v.sub : '',
      notes: Array.isArray(v.notes) ? (v.notes as EditionLayerNote[]) : [],
      count: Number(v.count) || 0,
      viz: (v.viz as EditionLayer['viz']) ?? null,
    }
  }
  return out
}

function mapSummaryRow(r: any): DcEditionSummary {
  return {
    id: r.id as string,
    number: r.number == null ? null : Number(r.number),
    date: r.edition_date as string,
    status: r.status as DcEditionSummary['status'],
    headline: (r.headline as string) ?? '',
    sub: (r.sub as string) ?? '',
    counts: { ...emptyCounts(), ...((r.counts as Partial<EditionCounts>) ?? {}) },
    moodScore: r.mood_score == null ? null : Number(r.mood_score),
    publishedAt: (r.published_at as string | null) ?? null,
  }
}

function mapEditionRow(r: any): DcEdition {
  return {
    ...mapSummaryRow(r),
    windowStart: r.window_start as string,
    windowEnd: r.window_end as string,
    notes: Array.isArray(r.notes) ? (r.notes as EditionNote[]) : [],
    moodCounts: { ...emptyMoodCounts(), ...((r.mood_counts as Partial<EditionMoodCounts>) ?? {}) },
    moodSeries: Array.isArray(r.mood_series) ? (r.mood_series as EditionMoodPoint[]) : [],
    layers: normaliseLayers(r.layers),
    research: { ...emptyResearch(), ...((r.research as Partial<EditionResearch>) ?? {}) },
    energy: { ...emptyEnergy(), ...((r.energy as Partial<EditionEnergy>) ?? {}) },
    geo: { ...emptyGeo(), ...((r.geo as Partial<EditionGeo>) ?? {}) },
    tape: Array.isArray(r.tape) ? (r.tape as EditionTapeTick[]) : [],
    charts: normaliseCharts(r.charts),
    chartSkips: normaliseChartSkips(r.chart_skips),
    storyIds: ((r.story_ids as unknown[]) ?? []).map(Number),
    paperIds: (r.paper_ids as string[]) ?? [],
    ieaIds: ((r.iea_ids as unknown[]) ?? []).map(Number),
    model: (r.model as string | null) ?? null,
    classifierVersion: (r.classifier_version as string | null) ?? null,
    composerRuns: Array.isArray(r.composer_runs) ? (r.composer_runs as EditionComposerRun[]) : [],
    editedFields: (r.edited_fields as string[]) ?? [],
    autoPublishAt: (r.auto_publish_at as string | null) ?? null,
    holdCount: Number(r.hold_count) || 0,
    generatedAt: (r.generated_at as string | null) ?? null,
    reviewedBy: (r.reviewed_by as string | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// Places, stocks, tagged news, papers

export async function listDcPlaces(): Promise<DcPlace[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_places')
    .select('slug, name, region, lat, lng, aliases')
    .eq('is_active', true)
    .order('slug')
  if (error) throw new Error(`listDcPlaces: ${error.message}`)
  return (data ?? []).map(mapPlaceRow)
}

export async function listDcStockNames(): Promise<StockName[]> {
  const sb = createServiceClient()
  const { data, error } = await sb.from('dc_stocks').select('ticker, name, category').eq('is_active', true)
  if (error) throw new Error(`listDcStockNames: ${error.message}`)
  return (data ?? []) as StockName[]
}

/** Relevant dc_news rows published inside [start, end), newest first, with tags. */
export async function listDcNewsTagged(opts: {
  start: string
  end: string
  limit?: number
}): Promise<DcEditionStory[]> {
  const sb = createServiceClient()
  const { data, error } = await withTaggedColumns((cols) =>
    sb
      .from('dc_news')
      .select(cols)
      .eq('relevant', true)
      .gte('published_at', opts.start)
      .lt('published_at', opts.end)
      .order('published_at', { ascending: false })
      .limit(opts.limit ?? 200),
  )
  if (error) throw new Error(`listDcNewsTagged: ${error.message}`)
  return (data ?? []).map((r) => mapDcStoryRow(r))
}

export async function listDcNewsByIds(ids: number[]): Promise<DcEditionStory[]> {
  if (ids.length === 0) return []
  const sb = createServiceClient()
  const out: DcEditionStory[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await withTaggedColumns((cols) => sb.from('dc_news').select(cols).in('id', ids.slice(i, i + 200)))
    if (error) throw new Error(`listDcNewsByIds: ${error.message}`)
    out.push(...(data ?? []).map((r) => mapDcStoryRow(r)))
  }
  const order = new Map(ids.map((id, i) => [id, i]))
  return out.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

const IEA_COLUMNS = 'id, source_url, title, summary, published_at, topics'

function mapIeaRow(r: any): DcEditionStory {
  return mapDcStoryRow({ ...r, source: 'IEA', tickers: [], layer: 'dc', theme: 'sustain', mood: 0, energy: true, facts: null }, 'iea')
}

/** iea_news rows in the window that read as data-centre / AI demand stories. */
export async function listIeaNewsForEditionWindow(opts: { start: string; end: string; limit?: number }): Promise<DcEditionStory[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('iea_news')
    .select(IEA_COLUMNS)
    .gte('published_at', opts.start)
    .lt('published_at', opts.end)
    .order('published_at', { ascending: false })
    .limit(60)
  if (error) throw new Error(`listIeaNewsForEditionWindow: ${error.message}`)
  const re = /data ?cent|\bAI\b|artificial intelligence|electricity demand|grid|hyperscal|compute/i
  return (data ?? [])
    .filter((r: any) => re.test(`${r.title} ${r.summary ?? ''}`))
    .slice(0, opts.limit ?? 5)
    .map(mapIeaRow)
}

export async function listIeaNewsByIds(ids: number[]): Promise<DcEditionStory[]> {
  if (ids.length === 0) return []
  const sb = createServiceClient()
  const { data, error } = await sb.from('iea_news').select(IEA_COLUMNS).in('id', ids)
  if (error) throw new Error(`listIeaNewsByIds: ${error.message}`)
  return (data ?? []).map(mapIeaRow)
}

/** Kept papers (relevant) with published_at inside [start, end), newest first. */
export async function listDcPapersInWindow(opts: { start: string; end: string; limit?: number }): Promise<DcPaper[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_papers')
    .select(PAPER_COLUMNS)
    .eq('relevant', true)
    .gte('published_at', opts.start)
    .lt('published_at', opts.end)
    .order('importance', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false })
    .limit(opts.limit ?? 40)
  if (error) throw new Error(`listDcPapersInWindow: ${error.message}`)
  return (data ?? []).map(mapPaperRow)
}

/** The papers an edition's membership names, in membership order. */
export async function listPapersForEdition(ids: string[]): Promise<DcPaper[]> {
  if (ids.length === 0) return []
  const sb = createServiceClient()
  const { data, error } = await sb.from('dc_papers').select(PAPER_COLUMNS).in('arxiv_id', ids)
  if (error) throw new Error(`listPapersForEdition: ${error.message}`)
  const order = new Map(ids.map((id, i) => [id, i]))
  return (data ?? []).map(mapPaperRow).sort((a, b) => (order.get(a.arxivId) ?? 0) - (order.get(b.arxivId) ?? 0))
}

/** Which of these arXiv ids are already in dc_papers (kept or rejected). */
export async function listKnownArxivIds(ids: string[]): Promise<Set<string>> {
  const known = new Set<string>()
  if (ids.length === 0) return known
  const sb = createServiceClient()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('dc_papers').select('arxiv_id').in('arxiv_id', ids.slice(i, i + 200))
    if (error) throw new Error(`listKnownArxivIds: ${error.message}`)
    for (const r of (data ?? []) as { arxiv_id: string }[]) known.add(r.arxiv_id)
  }
  return known
}

export interface DcPaperUpsert {
  arxiv_id: string
  title: string
  abstract: string | null
  authors: string | null
  affiliations: string | null
  kind: DcPaper['kind']
  category: string | null
  area: DcPaperArea | null
  bench: string | null
  baseline: number | null
  result: number | null
  unit: string | null
  compute_bucket: number | null
  scale: string | null
  weights_released: boolean
  code_released: boolean
  why: string | null
  tags: string[]
  importance: number | null
  relevant: boolean
  published_at: string
  classifier_version: string | null
}

export async function upsertDcPapers(rows: DcPaperUpsert[]): Promise<number> {
  if (rows.length === 0) return 0
  const sb = createServiceClient()
  const { error } = await sb
    .from('dc_papers')
    .upsert(rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })), { onConflict: 'arxiv_id' })
  if (error) throw new Error(`upsertDcPapers: ${error.message}`)
  return rows.length
}

// ---------------------------------------------------------------------------
// Market tape — the day's close vs prior close per active ticker

/** A mover's latest bar must be at most this stale (exchange holidays) to count. */
const TAPE_MAX_AGE_DAYS = 5

export async function getDcTapeMoves(windowEnd: Date): Promise<EditionTapeTick[]> {
  const sb = createServiceClient()
  const cutoff = new Date(windowEnd.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
  const [stocksR, pricesR] = await Promise.all([
    sb.from('dc_stocks').select('ticker, name, currency, category').eq('is_active', true),
    sb
      .from('dc_stock_prices')
      .select('ticker, trade_date, close')
      .gte('trade_date', cutoff)
      .lte('trade_date', windowEnd.toISOString().slice(0, 10))
      .order('trade_date', { ascending: true })
      .limit(2000),
  ])
  if (stocksR.error) throw new Error(`getDcTapeMoves stocks: ${stocksR.error.message}`)
  if (pricesR.error) throw new Error(`getDcTapeMoves prices: ${pricesR.error.message}`)
  const meta = new Map<string, { name: string; currency: string; category: string }>()
  for (const s of (stocksR.data ?? []) as { ticker: string; name: string; currency: string; category: string }[]) {
    meta.set(s.ticker, s)
  }
  const bars = new Map<string, { trade_date: string; close: number }[]>()
  for (const r of (pricesR.data ?? []) as { ticker: string; trade_date: string; close: number }[]) {
    const arr = bars.get(r.ticker) ?? []
    arr.push(r)
    bars.set(r.ticker, arr)
  }
  const freshFloor = new Date(windowEnd.getTime() - TAPE_MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10)
  const ticks: EditionTapeTick[] = []
  for (const [ticker, arr] of bars) {
    const m = meta.get(ticker)
    if (!m || arr.length < 2) continue
    const last = arr[arr.length - 1]
    const prev = arr[arr.length - 2]
    if (last.trade_date < freshFloor || !prev.close) continue
    ticks.push({
      ticker,
      name: m.name,
      category: m.category,
      changePct: Math.round(((last.close - prev.close) / prev.close) * 10000) / 100,
      close: last.close,
      currency: m.currency,
      tradeDate: last.trade_date,
    })
  }
  return buildTape(ticks)
}

// ---------------------------------------------------------------------------
// Published editions (public reads)

async function resolveContent(edition: DcEdition): Promise<DcEditionWithContent> {
  const [stories, papers, ieaStories] = await Promise.all([
    listDcNewsByIds(edition.storyIds),
    listPapersForEdition(edition.paperIds),
    listIeaNewsByIds(edition.ieaIds),
  ])
  return { ...edition, stories, papers, ieaStories }
}

/** The published edition for a UTC date, with its stories and papers; null if none. */
export async function getEdition(date: string): Promise<DcEditionWithContent | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_editions')
    .select(EDITION_COLUMNS)
    .eq('edition_date', date)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw new Error(`getEdition(${date}): ${error.message}`)
  return data ? resolveContent(mapEditionRow(data)) : null
}

export async function getLatestEdition(): Promise<DcEditionWithContent | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_editions')
    .select(EDITION_COLUMNS)
    .eq('status', 'published')
    .order('edition_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestEdition: ${error.message}`)
  return data ? resolveContent(mapEditionRow(data)) : null
}

/** Newest published editions first (archive rail, navigator, sitemap). */
export async function listEditions(limit = 30, opts: { before?: string } = {}): Promise<DcEditionSummary[]> {
  const sb = createServiceClient()
  let q = sb
    .from('dc_editions')
    .select(EDITION_SUMMARY_COLUMNS)
    .eq('status', 'published')
    .order('edition_date', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 400))
  if (opts.before) q = q.lt('edition_date', opts.before)
  const { data, error } = await q
  if (error) throw new Error(`listEditions: ${error.message}`)
  return (data ?? []).map(mapSummaryRow)
}

/** The published editions either side of a date, for the masthead stepper. */
export async function getEditionNeighbours(date: string): Promise<DcEditionNeighbours> {
  const sb = createServiceClient()
  const [prevR, nextR] = await Promise.all([
    sb
      .from('dc_editions')
      .select(EDITION_SUMMARY_COLUMNS)
      .eq('status', 'published')
      .lt('edition_date', date)
      .order('edition_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('dc_editions')
      .select(EDITION_SUMMARY_COLUMNS)
      .eq('status', 'published')
      .gt('edition_date', date)
      .order('edition_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  if (prevR.error) throw new Error(`getEditionNeighbours prev: ${prevR.error.message}`)
  if (nextR.error) throw new Error(`getEditionNeighbours next: ${nextR.error.message}`)
  return { prev: prevR.data ? mapSummaryRow(prevR.data) : null, next: nextR.data ? mapSummaryRow(nextR.data) : null }
}

/** Doom v Boom readings of the published editions, oldest first. */
export async function getMoodSeries(days = 30): Promise<EditionMoodPoint[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_editions')
    .select('edition_date, mood_score')
    .eq('status', 'published')
    .order('edition_date', { ascending: false })
    .limit(days)
  if (error) throw new Error(`getMoodSeries: ${error.message}`)
  return (data ?? [])
    .map((r: any) => ({ date: r.edition_date as string, score: r.mood_score == null ? null : Number(r.mood_score) }))
    .reverse()
}

// ---------------------------------------------------------------------------
// Draft (admin + pipeline)

export interface DcDraftEdition extends DcEditionWithContent {
  /** The composer's original membership (current ∪ last run), so dropped items can be restored. */
  candidateStories: DcEditionStory[]
  candidatePapers: DcPaper[]
}

async function readDraftRow(sb: Sb): Promise<DcEdition | null> {
  const { data, error } = await sb.from('dc_editions').select(EDITION_COLUMNS).eq('status', 'draft').limit(1).maybeSingle()
  if (error) throw new Error(`getDraftEdition: ${error.message}`)
  return data ? mapEditionRow(data) : null
}

/** The current draft (there is at most one) with its content, or null. */
export async function getDraftEdition(): Promise<DcDraftEdition | null> {
  const sb = createServiceClient()
  const draft = await readDraftRow(sb)
  if (!draft) return null
  const lastRun = draft.composerRuns[draft.composerRuns.length - 1]
  const candidateStoryIds = [...new Set([...(lastRun?.storyIds ?? []), ...draft.storyIds])]
  const candidatePaperIds = [...new Set([...(lastRun?.paperIds ?? []), ...draft.paperIds])]
  const [candidateStories, candidatePapers, ieaStories] = await Promise.all([
    listDcNewsByIds(candidateStoryIds),
    listPapersForEdition(candidatePaperIds),
    listIeaNewsByIds(draft.ieaIds),
  ])
  const inStories = new Set(draft.storyIds)
  const inPapers = new Set(draft.paperIds)
  return {
    ...draft,
    stories: candidateStories.filter((s) => inStories.has(s.id)),
    papers: candidatePapers.filter((p) => inPapers.has(p.arxivId)),
    ieaStories,
    candidateStories,
    candidatePapers,
  }
}

/** Admin read of any edition by date (draft or published). */
export async function getEditionForAdmin(date: string): Promise<DcEditionWithContent | null> {
  const sb = createServiceClient()
  const { data, error } = await sb.from('dc_editions').select(EDITION_COLUMNS).eq('edition_date', date).maybeSingle()
  if (error) throw new Error(`getEditionForAdmin(${date}): ${error.message}`)
  return data ? resolveContent(mapEditionRow(data)) : null
}

/** Archive for the admin: every edition, newest first, drafts included. */
export async function listEditionsForAdmin(limit = 60): Promise<(DcEditionSummary & { model: string | null; generatedAt: string | null })[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_editions')
    .select(`${EDITION_SUMMARY_COLUMNS}, model, generated_at`)
    .order('edition_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listEditionsForAdmin: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    ...mapSummaryRow(r),
    model: (r.model as string | null) ?? null,
    generatedAt: (r.generated_at as string | null) ?? null,
  }))
}

/** The numbers an edition carries — everything except the prose. */
export interface EditionNumbers {
  moodScore: number | null
  moodCounts: EditionMoodCounts
  moodSeries: EditionMoodPoint[]
  geo: EditionGeo
  tape: EditionTapeTick[]
  layerCounts: Record<DcLayerKey, number>
  layerViz: Record<DcLayerKey, EditionLayer['viz']>
  energy: EditionEnergy
  fieldBaseline: Record<DcPaperArea, number>
  counts: EditionCounts
}

/**
 * Assemble every numeric part of an edition from its membership rows. Reads
 * the places, ticker registry, the tape, and 30 days of history (published
 * editions where they exist, else the tagged feed by daily window) for the
 * mood sparkline, the per-edition power bars and the research baselines.
 */
export async function assembleEditionNumbers(input: {
  editionDate: string
  stories: DcEditionStory[]
  ieaStories: DcEditionStory[]
  papers: DcPaper[]
}): Promise<EditionNumbers> {
  const { editionDate, stories, ieaStories, papers } = input
  const { start, end } = editionWindow(editionDate)
  const sb = createServiceClient()
  const historyStart = new Date(start.getTime() - 29 * 86_400_000)

  const [places, stocks, tape, historyRowsR, publishedR, papersR] = await Promise.all([
    listDcPlaces(),
    listDcStockNames(),
    getDcTapeMoves(end).catch((err) => {
      console.warn(`[editions] tape unavailable (${err instanceof Error ? err.message : err})`)
      return [] as EditionTapeTick[]
    }),
    listDcNewsTaggedAll(historyStart.toISOString(), start.toISOString()),
    sb
      .from('dc_editions')
      .select('edition_date, mood_score, mood_counts, energy')
      .eq('status', 'published')
      .gte('edition_date', historyStart.toISOString().slice(0, 10))
      .lt('edition_date', editionDate),
    sb
      .from('dc_papers')
      .select('area')
      .eq('relevant', true)
      .gte('published_at', new Date(end.getTime() - 30 * 86_400_000).toISOString())
      .lt('published_at', end.toISOString())
      .limit(2000),
  ])
  if (historyRowsR.error) throw new Error(`assembleEditionNumbers history: ${historyRowsR.error.message}`)
  if (publishedR.error) throw new Error(`assembleEditionNumbers editions: ${publishedR.error.message}`)
  if (papersR.error) throw new Error(`assembleEditionNumbers papers: ${papersR.error.message}`)

  const placeMap = new Map(places.map((p) => [p.slug, p]))
  const stockMap = new Map(stocks.map((s) => [s.ticker, s]))

  // Daily history: a published edition's frozen reading wins; otherwise the
  // tagged feed bucketed by edition window.
  const byDay = new Map<string, DcEditionStory[]>()
  const historyStories: DcEditionStory[] = []
  for (const r of historyRowsR.data ?? []) {
    const story = mapDcStoryRow(r)
    historyStories.push(story)
    const day = editionDateFor(new Date(story.publishedAt))
    const arr = byDay.get(day) ?? []
    arr.push(story)
    byDay.set(day, arr)
  }
  // The clustering's IDF: 30 days of the feed plus the window, so a quiet day
  // still knows which words are common in this beat.
  const idf = buildIdf([...historyStories, ...stories])
  const published = new Map<string, { score: number | null; sameMethod: boolean; gw: number | null }>()
  for (const r of (publishedR.data ?? []) as { edition_date: string; mood_score: unknown; mood_counts: { method?: string } | null; energy: { hero?: { value?: number } | null } | null }[]) {
    // No hero figure means that edition disclosed no power at all. Keep it as
    // null so the history chart can draw the gap; 0 would read as "disclosed,
    // and it was nothing".
    const hero = r.energy?.hero?.value
    published.set(r.edition_date, {
      score: r.mood_score == null ? null : Number(r.mood_score),
      sameMethod: r.mood_counts?.method === MOOD_METHOD,
      gw: hero == null ? null : Number(hero) || null,
    })
  }
  const moodSeries: EditionMoodPoint[] = []
  const powerHistory: EditionEnergy['perEdition'] = []
  for (let i = 29; i >= 1; i--) {
    const d = new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    const pub = published.get(d)
    const dayStories = byDay.get(d) ?? []
    // A frozen reading counts only when it was measured the same way (events,
    // weighted); older editions counted stories, so their day is re-read from
    // the feed and the 7- and 30-day ticks compare like with like.
    moodSeries.push({ date: d, score: pub?.sameMethod ? pub.score : scoreMoodEvents(dayStories, { idf }).score })
    if (i <= 6) {
      const committed = pub ? null : powerCommitted(dayStories, placeMap, stockMap)
      powerHistory.push({
        date: d,
        label: formatEditionDayLabel(d),
        gw: pub ? pub.gw : committed && committed.parts.length > 0 ? committed.total : null,
      })
    }
  }
  const mood = scoreMoodEvents(stories, { idf })
  moodSeries.push({ date: editionDate, score: mood.score })

  const today = decimalYear(editionDate)
  const layerCounts = {} as Record<DcLayerKey, number>
  const layerViz = {} as Record<DcLayerKey, EditionLayer['viz']>
  for (const k of DC_LAYER_KEYS) {
    layerCounts[k] = stories.filter((s) => s.layer === k).length
    layerViz[k] = buildLayerViz(k, stories, { places: placeMap, stocks: stockMap, today })
  }
  const geo = buildGeo(stories, places)
  const energy = buildEnergy(stories, ieaStories, { places: placeMap, stocks: stockMap, history: powerHistory, editionDate })
  const baseline = fieldBaseline((papersR.data ?? []) as { area: DcPaperArea | null }[], 30)

  return {
    moodScore: mood.score,
    moodCounts: mood.counts,
    moodSeries,
    geo,
    tape,
    layerCounts,
    layerViz,
    energy,
    fieldBaseline: baseline,
    counts: buildCounts({ stories, ieaStories, papers, tape, geo }),
  }
}

export interface DraftUpsert {
  editionDate: string
  text: EditionText
  numbers: EditionNumbers
  storyIds: number[]
  paperIds: string[]
  ieaIds: number[]
  model: string
  classifierVersion: string | null
  generatedAt: string
  /** When true, editor edits on an existing draft are dropped. */
  clearEdits?: boolean
  /** Composer-planned charts; omitted = keep whatever the existing draft carries. */
  charts?: EditionCharts
  chartSkips?: EditionChartSkip[]
}

function layersColumn(text: EditionText, numbers: EditionNumbers): Record<DcLayerKey, EditionLayer> {
  const out = emptyLayers()
  for (const k of DC_LAYER_KEYS) {
    out[k] = {
      headline: text.layers[k]?.headline ?? '',
      sub: text.layers[k]?.sub ?? '',
      notes: text.layers[k]?.notes ?? [],
      count: numbers.layerCounts[k],
      viz: numbers.layerViz[k],
    }
  }
  return out
}

function textFromEdition(e: DcEdition): EditionText {
  const layers = {} as EditionText['layers']
  for (const k of DC_LAYER_KEYS) {
    layers[k] = { headline: e.layers[k].headline, sub: e.layers[k].sub, notes: e.layers[k].notes }
  }
  return { headline: e.headline, sub: e.sub, notes: e.notes, layers, research: { headline: e.research.headline, sub: e.research.sub } }
}

/**
 * Write (or rewrite) the draft for a date. A published row for the date is
 * never touched. Editor edits on the existing draft survive unless
 * `clearEdits` is set; every run is appended to composer_runs.
 */
export async function upsertDraftEdition(input: DraftUpsert): Promise<DcEdition> {
  const sb = createServiceClient()
  const { start, end } = editionWindow(input.editionDate)
  const { data: existingRow, error: readErr } = await sb
    .from('dc_editions')
    .select(EDITION_COLUMNS)
    .eq('edition_date', input.editionDate)
    .maybeSingle()
  if (readErr) throw new Error(`upsertDraftEdition read: ${readErr.message}`)
  const existing = existingRow ? mapEditionRow(existingRow) : null
  if (existing?.status === 'published') {
    throw new Error(`edition ${input.editionDate} is already published — corrections run in the next edition`)
  }

  let text = input.text
  let editedFields = existing?.editedFields ?? []
  if (existing && !input.clearEdits && editedFields.length > 0) {
    const { overlayEditedFields } = await import('./dcEditionAssembly')
    text = overlayEditedFields(text, textFromEdition(existing), editedFields)
  } else {
    editedFields = []
  }

  const run: EditionComposerRun = {
    generatedAt: input.generatedAt,
    model: input.model,
    text: input.text,
    storyIds: input.storyIds,
    paperIds: input.paperIds,
    ieaIds: input.ieaIds,
  }
  const runs = [...(existing?.composerRuns ?? []), run].slice(-10)
  const n = input.numbers
  const row = {
    edition_date: input.editionDate,
    window_start: start.toISOString(),
    window_end: end.toISOString(),
    status: 'draft',
    headline: text.headline,
    sub: text.sub,
    notes: text.notes,
    mood_score: n.moodScore,
    mood_counts: n.moodCounts,
    mood_series: n.moodSeries,
    layers: layersColumn(text, n),
    research: {
      headline: text.research.headline,
      sub: text.research.sub,
      paperIds: input.paperIds,
      fieldBaseline: n.fieldBaseline,
      notice: input.paperIds.length === 0 ? 'No papers passed the gate for this window — the research chapter is empty.' : null,
    } satisfies EditionResearch,
    energy: n.energy,
    geo: n.geo,
    tape: n.tape,
    charts: input.charts ?? existing?.charts ?? {},
    chart_skips: input.chartSkips ?? existing?.chartSkips ?? [],
    counts: n.counts,
    story_ids: input.storyIds,
    paper_ids: input.paperIds,
    iea_ids: input.ieaIds,
    model: input.model,
    classifier_version: input.classifierVersion,
    composer_runs: runs,
    edited_fields: editedFields,
    auto_publish_at: existing?.autoPublishAt ?? editionPublishAt(input.editionDate).toISOString(),
    hold_count: existing?.holdCount ?? 0,
    generated_at: input.generatedAt,
  }
  const q = existing
    ? sb.from('dc_editions').update(row).eq('id', existing.id).select(EDITION_COLUMNS).single()
    : sb.from('dc_editions').insert(row).select(EDITION_COLUMNS).single()
  const { data, error } = await q
  if (error) throw new Error(`upsertDraftEdition write: ${error.message}`)
  return mapEditionRow(data)
}

/**
 * Replace the draft's planned charts only — the composer's `--charts-only`
 * path (and the admin's "Regenerate charts"). Prose, numbers, membership and
 * editor edits are untouched. A published row is never written.
 */
export async function saveDraftCharts(input: { editionDate: string; charts: EditionCharts; chartSkips: EditionChartSkip[] }): Promise<void> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_editions')
    .update({ charts: input.charts, chart_skips: input.chartSkips })
    .eq('edition_date', input.editionDate)
    .eq('status', 'draft')
    .select('id')
  if (error) throw new Error(`saveDraftCharts: ${error.message}`)
  if (!data?.length) throw new Error(`saveDraftCharts: no draft for ${input.editionDate} (published editions are frozen)`)
}

// ---------------------------------------------------------------------------
// Editor writes

export interface EditionTextPatch {
  headline?: string
  sub?: string
  notes?: (Partial<Pick<EditionNote, 'metric' | 'unit' | 'label' | 'text' | 'sources' | 'energy'>> | null)[]
  layers?: Partial<Record<DcLayerKey, { headline?: string; sub?: string; notes?: ({ text?: string; sources?: EditionSource[] } | null)[] }>>
  research?: { headline?: string; sub?: string }
}

const LIMITS = { headline: 220, sub: 700, note: 900, label: 140, metric: 24, unit: 16 }

function str(v: unknown, max: number, field: string): string {
  if (typeof v !== 'string') throw new Error(`${field}: expected a string`)
  const t = v.trim()
  if (t.length > max) throw new Error(`${field}: longer than ${max} characters`)
  return t
}

function validSources(v: unknown, allowed: Map<string, string>, field: string): EditionSource[] {
  if (!Array.isArray(v)) throw new Error(`${field}: expected an array of sources`)
  const out: EditionSource[] = []
  for (const s of v) {
    const url = typeof s?.url === 'string' ? s.url : ''
    if (!allowed.has(url)) throw new Error(`${field}: source must be a story or paper in this edition`)
    if (out.some((o) => o.url === url)) continue
    out.push({ name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : allowed.get(url)!, url })
  }
  return out
}

/**
 * Apply an editor's patch to the draft's prose. Sources are validated against
 * the edition's own stories and papers (picked, never typed). Records the
 * changed dot-paths in edited_fields and writes an ai_generations audit row.
 */
export async function saveDraftEdition(patch: EditionTextPatch, opts: { editor: string | null }): Promise<DcDraftEdition> {
  const draft = await getDraftEdition()
  if (!draft) throw new Error('no draft edition to edit')

  const allowed = new Map<string, string>()
  for (const s of [...draft.stories, ...draft.ieaStories]) allowed.set(s.url, s.source?.trim() || s.url)
  for (const p of draft.papers) allowed.set(`https://arxiv.org/abs/${p.arxivId}`, 'arXiv')

  const current = textFromEdition(draft)
  const next: EditionText = JSON.parse(JSON.stringify(current))
  if (patch.headline !== undefined) next.headline = str(patch.headline, LIMITS.headline, 'headline')
  if (patch.sub !== undefined) next.sub = str(patch.sub, LIMITS.sub, 'sub')
  if (patch.notes) {
    patch.notes.forEach((p, i) => {
      if (!p || !next.notes[i]) return
      const n = next.notes[i]
      if (p.metric !== undefined) n.metric = p.metric === null ? null : str(p.metric, LIMITS.metric, `notes.${i}.metric`) || null
      if (p.unit !== undefined) n.unit = p.unit === null ? null : str(p.unit, LIMITS.unit, `notes.${i}.unit`) || null
      if (p.label !== undefined) n.label = str(p.label, LIMITS.label, `notes.${i}.label`)
      if (p.text !== undefined) n.text = str(p.text, LIMITS.note, `notes.${i}.text`)
      if (p.sources !== undefined) n.sources = validSources(p.sources, allowed, `notes.${i}.sources`)
      if (p.energy !== undefined) n.energy = Boolean(p.energy)
    })
  }
  if (patch.layers) {
    for (const k of DC_LAYER_KEYS) {
      const p = patch.layers[k]
      if (!p) continue
      if (p.headline !== undefined) next.layers[k].headline = str(p.headline, LIMITS.headline, `layers.${k}.headline`)
      if (p.sub !== undefined) next.layers[k].sub = str(p.sub, LIMITS.sub, `layers.${k}.sub`)
      p.notes?.forEach((pn, i) => {
        if (!pn || !next.layers[k].notes[i]) return
        if (pn.text !== undefined) next.layers[k].notes[i].text = str(pn.text, LIMITS.note, `layers.${k}.notes.${i}.text`)
        if (pn.sources !== undefined) next.layers[k].notes[i].sources = validSources(pn.sources, allowed, `layers.${k}.notes.${i}.sources`)
      })
    }
  }
  if (patch.research) {
    if (patch.research.headline !== undefined) next.research.headline = str(patch.research.headline, LIMITS.headline, 'research.headline')
    if (patch.research.sub !== undefined) next.research.sub = str(patch.research.sub, LIMITS.sub, 'research.sub')
  }

  // Changed dot-paths (text fields via the flattener, sources by JSON compare).
  const before = flattenText(current)
  const after = flattenText(next)
  const changed = new Set<string>(draft.editedFields)
  for (const key of Object.keys(after)) if (before[key] !== after[key]) changed.add(key)
  next.notes.forEach((n, i) => {
    if (JSON.stringify(n.sources) !== JSON.stringify(current.notes[i]?.sources)) changed.add(`notes.${i}.sources`)
    if (n.energy !== current.notes[i]?.energy) changed.add(`notes.${i}.energy`)
  })
  for (const k of DC_LAYER_KEYS) {
    next.layers[k].notes.forEach((n, i) => {
      if (JSON.stringify(n.sources) !== JSON.stringify(current.layers[k].notes[i]?.sources)) changed.add(`layers.${k}.notes.${i}.sources`)
    })
  }
  const editedFields = [...changed].filter((p) => EDITABLE_PATH_RE.test(p))

  const sb = createServiceClient()
  const layers = { ...draft.layers }
  for (const k of DC_LAYER_KEYS) layers[k] = { ...draft.layers[k], headline: next.layers[k].headline, sub: next.layers[k].sub, notes: next.layers[k].notes }
  const { error } = await sb
    .from('dc_editions')
    .update({
      headline: next.headline,
      sub: next.sub,
      notes: next.notes,
      layers,
      research: { ...draft.research, headline: next.research.headline, sub: next.research.sub },
      edited_fields: editedFields,
      reviewed_by: opts.editor ?? draft.reviewedBy,
    })
    .eq('id', draft.id)
    .eq('status', 'draft')
  if (error) throw new Error(`saveDraftEdition: ${error.message}`)

  await recordEditionEdit(sb, { editionDate: draft.date, editor: opts.editor, patch, changed: editedFields })
  return (await getDraftEdition())!
}

async function recordEditionEdit(
  sb: Sb,
  input: { editionDate: string; editor: string | null; patch: unknown; changed: string[] },
): Promise<void> {
  const prompt = JSON.stringify(input.patch)
  const params = { editionDate: input.editionDate, editor: input.editor, changed: input.changed, kind: 'edition_edit' }
  const requestHash = createHash('sha256').update(`editor\n${prompt}\n${JSON.stringify(params)}\n${Date.now()}`).digest('hex')
  const { error } = await sb.from('ai_generations').insert({
    kind: 'edition_edit',
    story_slug: null,
    prompt,
    model: 'editor',
    params,
    request_hash: requestHash,
    result_ref: null,
    result_text: JSON.stringify({ editionDate: input.editionDate, changed: input.changed }),
  })
  // Audit failure must not lose the edit itself — surface it in the log only.
  if (error) console.warn(`[editions] audit row failed: ${error.message}`)
}

/**
 * Set the draft's membership (the story and paper ids that stay in the
 * edition). Ids must come from the composer's own candidates; the numeric
 * parts are re-derived from what remains.
 */
export async function setDraftMembership(input: { storyIds?: number[]; paperIds?: string[] }, opts: { editor: string | null }): Promise<DcDraftEdition> {
  const draft = await getDraftEdition()
  if (!draft) throw new Error('no draft edition to edit')
  const storyPool = new Set(draft.candidateStories.map((s) => s.id))
  const paperPool = new Set(draft.candidatePapers.map((p) => p.arxivId))
  const storyIds = input.storyIds ? [...new Set(input.storyIds.map(Number))].filter((id) => storyPool.has(id)) : draft.storyIds
  const paperIds = input.paperIds ? [...new Set(input.paperIds)].filter((id) => paperPool.has(id)) : draft.paperIds

  const stories = draft.candidateStories.filter((s) => storyIds.includes(s.id))
  const papers = draft.candidatePapers.filter((p) => paperIds.includes(p.arxivId))
  const numbers = await assembleEditionNumbers({ editionDate: draft.date, stories, ieaStories: draft.ieaStories, papers })

  const layers = { ...draft.layers }
  for (const k of DC_LAYER_KEYS) layers[k] = { ...draft.layers[k], count: numbers.layerCounts[k], viz: numbers.layerViz[k] }
  // A chart that quoted a dropped story goes with it; its section falls back to the template.
  const charts = pruneChartsForMembership(draft.charts, storyIds, draft.ieaIds)
  const dropped = EDITION_CHART_SECTIONS.filter((k) => draft.charts[k] && !charts[k])
  const chartSkips = [
    ...draft.chartSkips.filter((k) => !dropped.includes(k.section)),
    ...dropped.map((section) => ({ section, reason: 'a story the chart quoted was removed from the edition' })),
  ]
  const sb = createServiceClient()
  const { error } = await sb
    .from('dc_editions')
    .update({
      story_ids: storyIds,
      paper_ids: paperIds,
      charts,
      chart_skips: chartSkips,
      mood_score: numbers.moodScore,
      mood_counts: numbers.moodCounts,
      mood_series: numbers.moodSeries,
      layers,
      research: { ...draft.research, paperIds, fieldBaseline: numbers.fieldBaseline },
      energy: numbers.energy,
      geo: numbers.geo,
      tape: numbers.tape,
      counts: numbers.counts,
      reviewed_by: opts.editor ?? draft.reviewedBy,
    })
    .eq('id', draft.id)
    .eq('status', 'draft')
  if (error) throw new Error(`setDraftMembership: ${error.message}`)
  await recordEditionEdit(sb, {
    editionDate: draft.date,
    editor: opts.editor,
    patch: { membership: { storyIds, paperIds } },
    changed: ['story_ids', 'paper_ids'],
  })
  return (await getDraftEdition())!
}

/** Extend the review window by 30 minutes — once. */
export async function holdDraftEdition(opts: { editor: string | null }): Promise<DcEdition> {
  const sb = createServiceClient()
  const draft = await readDraftRow(sb)
  if (!draft) throw new Error('no draft edition to hold')
  if (draft.holdCount >= 1) throw new Error('this draft has already been held once')
  const base = draft.autoPublishAt ? new Date(draft.autoPublishAt) : editionPublishAt(draft.date)
  const next = new Date(Math.max(base.getTime(), Date.now()) + EDITION_HOLD_MINUTES * 60_000)
  const { data, error } = await sb
    .from('dc_editions')
    .update({ auto_publish_at: next.toISOString(), hold_count: draft.holdCount + 1, reviewed_by: opts.editor ?? draft.reviewedBy })
    .eq('id', draft.id)
    .eq('status', 'draft')
    .select(EDITION_COLUMNS)
    .single()
  if (error) throw new Error(`holdDraftEdition: ${error.message}`)
  return mapEditionRow(data)
}

export interface PublishResult {
  published: boolean
  edition: DcEdition | null
  reason: string | null
}

/**
 * Freeze the draft: status → published, sequential number, published_at.
 * With `onlyIfDue`, a draft whose auto_publish_at is still in the future is
 * left alone (the 09:00 cron respects a Hold; the admin's Publish now does not).
 */
export async function publishDraftEdition(opts: { reviewedBy?: string | null; onlyIfDue?: boolean } = {}): Promise<PublishResult> {
  const sb = createServiceClient()
  const draft = await readDraftRow(sb)
  if (!draft) return { published: false, edition: null, reason: 'no draft' }
  if (opts.onlyIfDue && draft.autoPublishAt && Date.parse(draft.autoPublishAt) > Date.now()) {
    return { published: false, edition: draft, reason: `held until ${draft.autoPublishAt}` }
  }
  const { data: maxRow, error: maxErr } = await sb
    .from('dc_editions')
    .select('number')
    .eq('status', 'published')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) throw new Error(`publishDraftEdition number: ${maxErr.message}`)
  const number = draft.number ?? (Number((maxRow as { number?: number } | null)?.number ?? 0) + 1)
  const { data, error } = await sb
    .from('dc_editions')
    .update({
      status: 'published',
      number,
      published_at: new Date().toISOString(),
      reviewed_by: opts.reviewedBy ?? draft.reviewedBy,
    })
    .eq('id', draft.id)
    .eq('status', 'draft')
    .select(EDITION_COLUMNS)
    .single()
  if (error) throw new Error(`publishDraftEdition: ${error.message}`)
  return { published: true, edition: mapEditionRow(data), reason: null }
}

/**
 * Publish any draft older than `beforeDate` (its review window is long
 * over). Called by the composer before it opens the next draft, so the
 * one-draft-at-a-time rule never blocks the cron.
 */
export async function publishStaleDrafts(beforeDate: string): Promise<DcEdition[]> {
  const sb = createServiceClient()
  const draft = await readDraftRow(sb)
  if (!draft || draft.date >= beforeDate) return []
  const res = await publishDraftEdition({ onlyIfDue: false })
  return res.edition ? [res.edition] : []
}

/** The rare hard case: pull a published edition back to draft. */
export async function unpublishEdition(date: string): Promise<DcEdition | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_editions')
    .update({ status: 'draft', published_at: null })
    .eq('edition_date', date)
    .eq('status', 'published')
    .select(EDITION_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`unpublishEdition(${date}): ${error.message}`)
  return data ? mapEditionRow(data) : null
}
