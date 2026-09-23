/**
 * AI Data Centers daily snapshot — shared types and vocabularies.
 *
 * Pure types + constants only (no Supabase import) so the public edition
 * page's client components, the admin Editions tab and the pipeline scripts
 * can all import this file without dragging a DB client into a browser
 * bundle. Readers/writers live in ./dcEditions.ts; the deterministic
 * assembly (numbers, viz data, fallback prose) in ./dcEditionAssembly.ts.
 *
 * Schema: supabase/vizmaya-fyi/migrations/078_dc_editions.sql
 * PRD:    docs/ai-data-centers-daily-snapshot-prd.md
 */

// ---------------------------------------------------------------------------
// Vocabularies (written by the classifier, read everywhere)

/** The four AI layers — the same buckets dc_stocks.category uses. */
export type DcLayerKey = 'dc' | 'hyper' | 'semi' | 'equip'
export type DcRegionKey = 'na' | 'ea' | 'eu' | 'me' | 'other'
export type DcThemeKey = 'power' | 'permit' | 'memory' | 'capacity' | 'equip' | 'chips' | 'sustain'
/** -1 doom · 0 neutral · 1 boom */
export type DcMood = -1 | 0 | 1
export type DcPaperArea = 'reason' | 'arch' | 'infer' | 'multi' | 'align' | 'evalb'
export type DcPaperKind = 'lab' | 'academic' | 'mixed'
/** What a story says happened — drives the per-layer visualisations. */
export type DcStoryAction =
  | 'add'
  | 'pause'
  | 'freeze'
  | 'power-deal'
  | 'capacity'
  | 'permit'
  | 'disclosure'
  | 'pull-forward'
  | 'risk'
  | 'other'

export const DC_LAYER_KEYS: DcLayerKey[] = ['dc', 'hyper', 'semi', 'equip']
export const DC_REGION_KEYS: DcRegionKey[] = ['na', 'ea', 'eu', 'me', 'other']
export const DC_THEME_KEYS: DcThemeKey[] = ['power', 'permit', 'memory', 'capacity', 'equip', 'chips', 'sustain']
export const DC_PAPER_AREA_KEYS: DcPaperArea[] = ['reason', 'arch', 'infer', 'multi', 'align', 'evalb']
export const DC_STORY_ACTIONS: DcStoryAction[] = [
  'add', 'pause', 'freeze', 'power-deal', 'capacity', 'permit', 'disclosure', 'pull-forward', 'risk', 'other',
]

export const DC_LAYERS: Record<DcLayerKey, { name: string; short: string; desc: string; stockCategory: string }> = {
  dc: { name: 'Data centers', short: 'Data', desc: 'Sites, colocation, cooling, capacity leases.', stockCategory: 'data-centers' },
  hyper: { name: 'Hyperscalers', short: 'Hyper', desc: 'Capex, power procurement, model-capacity deals.', stockCategory: 'hyperscalers' },
  semi: { name: 'Semiconductors', short: 'Semi', desc: 'Accelerators, memory, foundry, packaging.', stockCategory: 'semiconductors' },
  equip: { name: 'Semi equipment', short: 'Equip', desc: 'Lithography, deposition, etch, test, export rules.', stockCategory: 'semi-equipment' },
}

export const DC_REGIONS: Record<DcRegionKey, string> = {
  na: 'North America',
  ea: 'East Asia',
  eu: 'Europe',
  me: 'India & Middle East',
  other: 'Rest of world',
}

export const DC_THEMES: Record<DcThemeKey, { name: string; so: string }> = {
  power: { name: 'Power & grid', so: 'Deals, queues and turbines — who gets electrons' },
  permit: { name: 'Permitting & policy', so: 'Freezes, rules and rezonings' },
  memory: { name: 'Memory & HBM', so: 'The allocation squeeze' },
  capacity: { name: 'Capacity & sites', so: 'MW added, leased or paused' },
  equip: { name: 'Tools & export rules', so: 'Litho, stacking, test' },
  chips: { name: 'Accelerators & foundry', so: 'Packaging and advanced-node output' },
  sustain: { name: 'Water & carbon', so: 'Disclosures and outlooks' },
}

export const DC_PAPER_AREAS: Record<DcPaperArea, string> = {
  reason: 'Reasoning & agents',
  arch: 'Architectures & training',
  infer: 'Inference efficiency',
  multi: 'Multimodal',
  align: 'Alignment & safety',
  evalb: 'Evaluation & benchmarks',
}

export const DC_PAPER_KINDS: Record<DcPaperKind, string> = {
  lab: 'Industry lab',
  academic: 'Academic',
  mixed: 'Academic + industry',
}

/** compute_bucket 0–3 → estimated FLOP of the headline experiment. */
export const DC_COMPUTE_BUCKETS = ['<10²² FLOP', '10²²–10²³', '10²⁴', '>10²⁵'] as const

/** Stock category → layer key (dc_stocks.category is the layer taxonomy). */
export const STOCK_CATEGORY_TO_LAYER: Record<string, DcLayerKey> = {
  'data-centers': 'dc',
  hyperscalers: 'hyper',
  semiconductors: 'semi',
  'semi-equipment': 'equip',
}

/** Edition windows run 08:15 → 08:15 UTC; the draft goes public at 09:00 UTC. */
export const EDITION_FREEZE_UTC = { hour: 8, minute: 15 } as const
export const EDITION_PUBLISH_UTC = { hour: 9, minute: 0 } as const
/** Hold extends the review window by this much, once. */
export const EDITION_HOLD_MINUTES = 30

// ---------------------------------------------------------------------------
// Story-level facts (dc_news.facts)

/** What a stated figure describes — the thing the number is a measure of. */
export type DcFigureScope = 'site' | 'company' | 'market' | 'policy'
/**
 * How firm a stated figure is. Only `committed` figures (signed, built,
 * spent, let) may share a scale with each other; a target and a site never
 * meet on one rail even when both are in MW.
 */
export type DcFigureStatus = 'committed' | 'target' | 'forecast' | 'queued' | 'stated'

export const DC_FIGURE_SCOPES: DcFigureScope[] = ['site', 'company', 'market', 'policy']
export const DC_FIGURE_STATUSES: DcFigureStatus[] = ['committed', 'target', 'forecast', 'queued', 'stated']

export interface DcStoryFigure {
  value: number
  /** 'MW' | 'GW' | 'GWh' | '$bn' | '%' | 'year' | '' … as the story states it. */
  unit: string
  label: string
  /**
   * The canonical entity the figure belongs to — a company, a site, a
   * country, a market ("Amazon", "West Java campus", "South Korea", "global
   * data center capacity"). Rows that share a subject on a chart are the same
   * thing measured twice, so the composer can dedupe on it. Absent on rows
   * classified before v3.
   */
  subject?: string | null
  scope?: DcFigureScope | null
  status?: DcFigureStatus | null
  /**
   * The figure in its dimension's base unit (MW for power, MWh for energy,
   * USD millions for money, the bare number for shares), so two figures of one
   * dimension compare without re-parsing the unit. null when the unit has no
   * scale (a year, a count). Absent on rows classified before v3.
   */
  base?: number | null
  /**
   * Jev's probability (0–1) that the figure is a quantity the story literally
   * states, with these tags. Figures below the gate's threshold are dropped at
   * ingest; the survivors keep their score. Absent when the gate was off.
   */
  confidence?: number | null
}

export interface DcStoryHorizon {
  /** 'YYYY' | 'YYYY-Qn' | 'YYYY-MM' | 'FYnn', as stated; null when open-ended. */
  from: string | null
  to: string | null
}

export interface DcStoryFacts {
  action: DcStoryAction | null
  figures: DcStoryFigure[]
  horizon: DcStoryHorizon | null
}

// ---------------------------------------------------------------------------
// Resolved rows the page renders

export interface DcEditionStory {
  id: number
  url: string
  title: string
  summary: string | null
  /** Outlet name (Reuters, Bloomberg, …). */
  source: string | null
  publishedAt: string
  topics: string[]
  tickers: string[]
  layer: DcLayerKey | null
  /** dc_places.slug */
  place: string | null
  region: DcRegionKey | null
  theme: DcThemeKey | null
  mood: DcMood | null
  energy: boolean
  facts: DcStoryFacts | null
  /** 'news' = dc_news, 'iea' = iea_news joined in for the energy chapter. */
  kind: 'news' | 'iea'
}

export interface DcPlace {
  slug: string
  name: string
  region: DcRegionKey
  lat: number
  lng: number
  aliases: string[]
}

export interface DcPaper {
  arxivId: string
  title: string
  abstract: string | null
  authors: string | null
  affiliations: string | null
  kind: DcPaperKind | null
  category: string | null
  area: DcPaperArea | null
  bench: string | null
  baseline: number | null
  result: number | null
  unit: string | null
  computeBucket: number | null
  scale: string | null
  weightsReleased: boolean
  codeReleased: boolean
  why: string | null
  tags: string[]
  /** 1–5 from the papers gate; the composer keeps the top 8 per edition. */
  importance: number | null
  relevant: boolean
  publishedAt: string
}

// ---------------------------------------------------------------------------
// Edition JSON (the row is the page)

export interface EditionSource {
  name: string
  url: string
}

export interface EditionNote {
  /** The number that matters, as text ('4.6', '2027', 'High-NA'); null = no lead figure. */
  metric: string | null
  unit: string | null
  label: string
  text: string
  sources: EditionSource[]
  energy: boolean
}

export interface EditionLayerNote {
  text: string
  sources: EditionSource[]
}

/** Data centers — capacity on the move (MW added vs items paused / frozen). */
export interface CapacityViz {
  kind: 'capacity'
  rows: { label: string; mw: number | null; action: 'add' | 'pause' | 'freeze'; storyId: number }[]
  addedMw: number
  pausedCount: number
}

/** Hyperscalers — company × action matrix. */
export interface MatrixViz {
  kind: 'matrix'
  companies: string[]
  actions: string[]
  cells: { company: string; action: string; label: string; storyId: number }[]
}

/** Semiconductors — booked-out horizon per supplier on a timeline. */
export interface HorizonViz {
  kind: 'horizon'
  /** Decimal years. */
  t0: number
  t1: number
  today: number
  rows: {
    label: string
    desc: string
    from: number
    to: number
    style: 'solid' | 'later' | 'mark'
    storyId: number
  }[]
}

/** Semi equipment — orders moving in time. */
export interface OrdersViz {
  kind: 'orders'
  t0: number
  t1: number
  today: number
  rows: {
    label: string
    desc: string
    from: number
    to: number
    style: 'pull-forward' | 'window' | 'risk' | 'mark'
    storyId: number
  }[]
}

export type EditionLayerViz = CapacityViz | MatrixViz | HorizonViz | OrdersViz

export interface EditionLayer {
  headline: string
  sub: string
  notes: EditionLayerNote[]
  count: number
  viz: EditionLayerViz | null
}

export interface EditionResearch {
  headline: string
  sub: string
  paperIds: string[]
  /** 30-edition average papers per edition, per area. */
  fieldBaseline: Record<DcPaperArea, number>
  /** Shown when the papers job failed and the chapter is empty. */
  notice: string | null
}

export interface EditionEnergy {
  hero: { value: number; unit: string; label: string } | null
  composition: { label: string; gw: number; storyId: number | null }[]
  /**
   * Last 7 editions incl. this one: power disclosed per edition. `null` = that
   * edition disclosed no capacity figure at all — a gap in the record, which
   * the chart draws as a gap rather than as a zero.
   */
  perEdition: { date: string; label: string; gw: number | null }[]
  figures: { value: string; unit: string | null; label: string; storyId: number | null }[]
  storyCount: number
  links: { label: string; href: string }[]
}

export interface EditionGeoPlace {
  slug: string
  name: string
  region: DcRegionKey
  lat: number
  lng: number
  count: number
  energy: boolean
}

export interface EditionGeoRegion {
  key: DcRegionKey
  count: number
  byLayer: Partial<Record<DcLayerKey, number>>
}

export interface EditionGeo {
  places: EditionGeoPlace[]
  regions: EditionGeoRegion[]
}

export interface EditionTapeTick {
  ticker: string
  name: string
  category: string
  changePct: number
  close: number
  currency: string
  tradeDate: string
}

export interface EditionCounts {
  stories: number
  papers: number
  tickers: number
  places: number
  energy: number
  links: number
  outlets: number
}

export interface EditionMoodPoint {
  date: string
  score: number | null
}

export interface EditionMoodCounts {
  boom: number
  doom: number
  neutral: number
}

/**
 * A chart the composer PLANNED for one section of the edition, compiled
 * through flint (`@vismay/story-pipeline` buildEChartsOption) and rendered to
 * an SVG string server-side at compose time. The page inlines the SVG; the
 * spec stays alongside so an editor can see exactly what was compared and
 * the admin can re-plan it. Sections without a planned chart fall back to
 * the deterministic templates (`EditionLayerViz`, the energy chapter's own
 * vizzes).
 */
export type EditionChartSection = 'energy' | DcLayerKey
export const EDITION_CHART_SECTIONS: EditionChartSection[] = ['energy', 'dc', 'hyper', 'semi', 'equip']

export interface EditionChartColumn {
  name: string
  /** flint semantic type — Category, Name, Quantity, Amount, Percentage, Year … */
  semanticType: string
}

export interface EditionChartSpec {
  chartType: string
  columns: EditionChartColumn[]
  /** One value per column, in `columns` order. */
  rows: Array<Array<string | number>>
  /** flint channel → column name(s). */
  encodings: Record<string, string | string[]>
  xLabel?: string
  yLabel?: string
}

export interface EditionChart {
  section: EditionChartSection
  /** The eyebrow over the chart: what is being compared, in ≤ 9 words. */
  title: string
  /** One sentence under the chart: the reading, plus any caveat about the comparison. */
  caption: string
  spec: EditionChartSpec
  /** Every story a row was taken from. */
  sources: EditionSource[]
  storyIds: number[]
  /** ECharts SSR output in theme-token colours; null when the render failed (the page then falls back). */
  svg: string | null
  width: number
  height: number
  model: string
  generatedAt: string
}

/** Per-section planned charts; a missing key means "use the template". */
export type EditionCharts = Partial<Record<EditionChartSection, EditionChart>>

/** Why the composer planned no chart for a section — printed in the admin, never on the page. */
export interface EditionChartSkip {
  section: EditionChartSection
  reason: string
}

/** The prose layer — what the composer (or an editor) writes. */
export interface EditionText {
  headline: string
  sub: string
  notes: EditionNote[]
  layers: Record<DcLayerKey, { headline: string; sub: string; notes: EditionLayerNote[] }>
  research: { headline: string; sub: string }
}

export interface EditionComposerRun {
  generatedAt: string
  model: string
  text: EditionText
  storyIds: number[]
  paperIds: string[]
  ieaIds: number[]
}

export type EditionStatus = 'draft' | 'published'

/** Archive-rail / navigator shape. */
export interface DcEditionSummary {
  id: string
  number: number | null
  date: string
  status: EditionStatus
  headline: string
  sub: string
  counts: EditionCounts
  moodScore: number | null
  publishedAt: string | null
}

export interface DcEdition extends DcEditionSummary {
  windowStart: string
  windowEnd: string
  notes: EditionNote[]
  moodCounts: EditionMoodCounts
  moodSeries: EditionMoodPoint[]
  layers: Record<DcLayerKey, EditionLayer>
  research: EditionResearch
  energy: EditionEnergy
  geo: EditionGeo
  tape: EditionTapeTick[]
  /** Composer-planned charts (migration 079). Empty on editions composed before it. */
  charts: EditionCharts
  /** What the composer held back and why, for the admin. */
  chartSkips: EditionChartSkip[]
  storyIds: number[]
  paperIds: string[]
  ieaIds: number[]
  model: string | null
  classifierVersion: string | null
  composerRuns: EditionComposerRun[]
  editedFields: string[]
  autoPublishAt: string | null
  holdCount: number
  generatedAt: string | null
  reviewedBy: string | null
}

/** An edition plus the rows its membership arrays point at. */
export interface DcEditionWithContent extends DcEdition {
  stories: DcEditionStory[]
  papers: DcPaper[]
  ieaStories: DcEditionStory[]
}

/** Neighbouring editions for the masthead date stepper. */
export interface DcEditionNeighbours {
  prev: DcEditionSummary | null
  next: DcEditionSummary | null
}

// ---------------------------------------------------------------------------
// Small shared helpers

export function emptyMoodCounts(): EditionMoodCounts {
  return { boom: 0, doom: 0, neutral: 0 }
}

export function emptyCounts(): EditionCounts {
  return { stories: 0, papers: 0, tickers: 0, places: 0, energy: 0, links: 0, outlets: 0 }
}

export function emptyFieldBaseline(): Record<DcPaperArea, number> {
  return { reason: 0, arch: 0, infer: 0, multi: 0, align: 0, evalb: 0 }
}

export function emptyLayer(): EditionLayer {
  return { headline: '', sub: '', notes: [], count: 0, viz: null }
}

export function emptyLayers(): Record<DcLayerKey, EditionLayer> {
  return { dc: emptyLayer(), hyper: emptyLayer(), semi: emptyLayer(), equip: emptyLayer() }
}

export function emptyResearch(): EditionResearch {
  return { headline: '', sub: '', paperIds: [], fieldBaseline: emptyFieldBaseline(), notice: null }
}

export function emptyEnergy(): EditionEnergy {
  return { hero: null, composition: [], perEdition: [], figures: [], storyCount: 0, links: [] }
}

export function emptyGeo(): EditionGeo {
  return { places: [], regions: [] }
}

/** Edition window for a UTC date: 08:15 the day before → 08:15 on the date. */
export function editionWindow(editionDate: string): { start: Date; end: Date } {
  const end = new Date(`${editionDate}T00:00:00Z`)
  end.setUTCHours(EDITION_FREEZE_UTC.hour, EDITION_FREEZE_UTC.minute, 0, 0)
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  return { start, end }
}

/** Auto-publish instant for an edition date: 09:00 UTC on the date. */
export function editionPublishAt(editionDate: string): Date {
  const d = new Date(`${editionDate}T00:00:00Z`)
  d.setUTCHours(EDITION_PUBLISH_UTC.hour, EDITION_PUBLISH_UTC.minute, 0, 0)
  return d
}

/**
 * The edition date whose window contains `at`: after 08:15 UTC it is today's
 * date; before it, it is still the previous day's window.
 */
export function editionDateFor(at: Date = new Date()): string {
  const d = new Date(at.getTime())
  const cutoff = new Date(d.getTime())
  cutoff.setUTCHours(EDITION_FREEZE_UTC.hour, EDITION_FREEZE_UTC.minute, 0, 0)
  if (d.getTime() < cutoff.getTime()) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * 'Mon 22 Sep 2026' in UTC. Hand-formatted (no Intl) so the static pages
 * render identically whatever ICU data the build machine carries.
 */
export function formatEditionDate(date: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  const parts: string[] = []
  if (opts.weekday !== false) parts.push(WEEKDAYS[d.getUTCDay()])
  parts.push(`${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`)
  if (opts.year !== false) parts.push(String(d.getUTCFullYear()))
  return parts.join(' ')
}

/** 'Mon 22' — the per-edition bar labels. */
export function formatEditionDayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`
}

/** Doom v Boom reading → the word on the page ('Boom-leaning', 'Doom, clearly', …). */
export function moodWord(score: number | null): string {
  if (score == null) return 'Unscored'
  const a = Math.abs(score)
  if (a < 0.1) return 'Balanced'
  const side = score > 0 ? 'Boom' : 'Doom'
  return side + (a < 0.3 ? '-leaning' : a < 0.6 ? ', clearly' : ', decisively')
}

/** Short mood word for chips ('Boom', 'Doom', 'Balanced'). */
export function moodTone(score: number | null): 'boom' | 'doom' | 'mid' {
  if (score == null) return 'mid'
  return score > 0.1 ? 'boom' : score < -0.1 ? 'doom' : 'mid'
}

export function formatSigned(v: number | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const sign = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${sign}${Math.abs(v).toFixed(digits)}`
}
