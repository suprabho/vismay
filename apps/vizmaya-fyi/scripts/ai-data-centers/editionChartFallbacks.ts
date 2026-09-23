/**
 * Rung 4 — charts from the record alone, computed in code.
 *
 * The planner (rung 1) compares figures stated today, and most days no
 * three of them share a scale honestly. These builders are what makes a
 * chart guaranteed: every section has at least one comparison that exists
 * on any day, drawn from a standing dataset the epic already keeps —
 * Epoch's facility register, the tracked stocks' closes, the editions' own
 * power series, the day's kept papers. No model touches them; the caption
 * says where the numbers come from and the chart carries `rung: 4` so the
 * admin and the reader know they are looking at the record, not at today's
 * disclosures.
 *
 * Each builder returns a validated plan (columns, rows, encodings, sources)
 * or null when even the record is too thin — three rows is still the floor.
 */

import type { DcFacility, DcStockSeries } from '@vismay/content-source/epics'
import type { DcPaper, EditionChartSection, EditionEnergy, EditionSource, EditionTapeTick } from '@vismay/content-source/dcEditionTypes'
import { DC_PAPER_AREAS, DC_PAPER_AREA_KEYS, type DcPaperArea } from '@vismay/content-source/dcEditionTypes'
import { MIN_CHART_ROWS, type ValidatedChartPlan } from '@vismay/content-source/dcEditionCharts'
import { shortTitle } from '@vismay/content-source/dcEditionAssembly'

/** What rung 4 can draw from. Everything optional: a missing dataset just skips its builders. */
export interface RecordInputs {
  tape?: EditionTapeTick[]
  /** Per-ticker close series over the trailing window (getDcStockMarket); lines and slopes need it, the tape alone only gives bars. */
  market?: DcStockSeries[]
  facilities?: DcFacility[]
  perEdition?: EditionEnergy['perEdition']
  papers?: DcPaper[]
  fieldBaseline?: Record<DcPaperArea, number>
}

const SOURCES = {
  stocks: { name: 'Tracked stocks · home-exchange closes', url: 'https://www.vizmaya.fyi/ai-data-centers' } satisfies EditionSource,
  epoch: { name: 'Epoch AI · Frontier Data Centers Hub', url: 'https://epoch.ai/data/ai-data-centers' } satisfies EditionSource,
  editions: { name: 'AI Data Centers Daily · previous editions', url: 'https://www.vizmaya.fyi/ai-data-centers/daily' } satisfies EditionSource,
  arxiv: { name: 'arXiv · papers kept for this edition', url: 'https://arxiv.org' } satisfies EditionSource,
}

const LAYER_CATEGORY: Partial<Record<EditionChartSection, string>> = {
  dc: 'data-centers',
  hyper: 'hyperscalers',
  semi: 'semiconductors',
  equip: 'semi-equipment',
}

const LAYER_WORD: Partial<Record<EditionChartSection, string>> = {
  dc: 'data-center operators',
  hyper: 'hyperscalers',
  semi: 'chipmakers',
  equip: 'toolmakers',
}

const r1 = (v: number) => Math.round(v * 10) / 10

/** Stock moves over the window for the layer's tracked companies, largest move first. */
/** A record chart with the builder that made it, so two sections never draw the same one. */
export interface RecordChart {
  key: string
  plan: ValidatedChartPlan
}

export function tapeMoves(section: EditionChartSection, tape: EditionTapeTick[] | undefined): ValidatedChartPlan | null {
  const category = LAYER_CATEGORY[section]
  if (!category || !tape) return null
  const rows = tape
    .filter((t) => t.category === category && Number.isFinite(t.changePct))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 8)
    .map((t) => [shortTitle(t.name, 22), r1(t.changePct)] as [string, number])
  if (rows.length < MIN_CHART_ROWS) return null
  const up = rows.filter((r) => r[1] > 0).length
  return {
    section,
    title: `${capitalise(LAYER_WORD[section] ?? 'stocks')} this window, by move`,
    caption: `${up} of ${rows.length} tracked ${LAYER_WORD[section]} rose over the window; the change is close to close on each company's home exchange, in its own currency.`,
    spec: {
      chartType: 'Bar Chart',
      columns: [
        { name: 'Company', semanticType: 'Name' },
        { name: 'Change (%)', semanticType: 'PercentageChange' },
      ],
      rows,
      encodings: { x: 'Company', y: ['Change (%)'] },
    },
    sources: [SOURCES.stocks],
    storyIds: [],
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** '2026-09-15' → '15 Sep' */
const sessionLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''}`

/** The layer's tracked companies with at least `min` closes in the window, largest move first. */
function layerSeries(section: EditionChartSection, market: DcStockSeries[] | undefined, min = 4): DcStockSeries[] {
  const category = LAYER_CATEGORY[section]
  if (!category || !market) return []
  return market
    .filter((s) => s.category === category && s.points.length >= min && s.changePct != null)
    .sort((a, b) => Math.abs(b.changePct as number) - Math.abs(a.changePct as number))
}

/**
 * Indexed closes over the last trading days for the layer's five biggest
 * movers — the same window as the tape, but as the path each company took
 * rather than the endpoint. Every series starts at 100 on the first day so
 * home-currency prices share one axis.
 */
export function indexedCloses(section: EditionChartSection, market: DcStockSeries[] | undefined, days = 10): ValidatedChartPlan | null {
  const series = layerSeries(section, market, 4).slice(0, 5)
  if (series.length < MIN_CHART_ROWS) return null
  const rows: Array<[string, string, number]> = []
  for (const s of series) {
    const pts = s.points.slice(-days)
    const base = pts[0]?.[1]
    if (!base) continue
    for (const [date, close] of pts) rows.push([sessionLabel(date), shortTitle(s.name, 18), r2((close / base) * 100)])
  }
  if (new Set(rows.map((r) => r[1])).size < MIN_CHART_ROWS) return null
  const span = series[0].points.slice(-days)
  return {
    section,
    title: `${capitalise(LAYER_WORD[section] ?? 'stocks')}, indexed over the last ${span.length} sessions`,
    caption: `Closing prices on each company's home exchange, indexed to 100 at the first session shown, for the ${series.length} ${LAYER_WORD[section]} that moved most over the window.`,
    spec: {
      chartType: 'Line Chart',
      // Sessions are a category axis on purpose: flint's Date axis expects
      // a parseable date and draws nothing for a bare "09-15".
      columns: [
        { name: 'Session', semanticType: 'Category' },
        { name: 'Company', semanticType: 'Category' },
        { name: 'Index (first session = 100)', semanticType: 'Quantity' },
      ],
      rows,
      encodings: { x: 'Session', y: ['Index (first session = 100)'], color: 'Company' },
    },
    sources: [SOURCES.stocks],
    storyIds: [],
  }
}

/** Window open → window close for each of the layer's companies, indexed — who pulled away and who fell back. */
export function slopeMoves(section: EditionChartSection, market: DcStockSeries[] | undefined): ValidatedChartPlan | null {
  const series = layerSeries(section, market, 2).slice(0, 6)
  if (series.length < MIN_CHART_ROWS) return null
  const rows: Array<[string, string, number]> = []
  for (const s of series) {
    const first = s.points[0][1]
    const last = s.points[s.points.length - 1][1]
    if (!first) continue
    rows.push(['Window open', shortTitle(s.name, 18), 100])
    rows.push(['Window close', shortTitle(s.name, 18), r2((last / first) * 100)])
  }
  const up = series.filter((s) => (s.changePct ?? 0) > 0).length
  return {
    section,
    title: `${capitalise(LAYER_WORD[section] ?? 'stocks')} from window open to close`,
    caption: `${up} of ${series.length} tracked ${LAYER_WORD[section]} closed the window above where they opened it; each line is one company's close, indexed to 100 at the open.`,
    spec: {
      chartType: 'Slope Chart',
      columns: [
        { name: 'Point', semanticType: 'Category' },
        { name: 'Company', semanticType: 'Category' },
        { name: 'Index (open = 100)', semanticType: 'Quantity' },
      ],
      rows,
      encodings: { x: 'Point', y: ['Index (open = 100)'], color: 'Company' },
    },
    sources: [SOURCES.stocks],
    storyIds: [],
  }
}

/** Frontier sites placed by stated power against stated capital cost — how much money a megawatt of frontier AI takes. */
export function facilityPowerVsCapex(section: EditionChartSection, facilities: DcFacility[] | undefined): ValidatedChartPlan | null {
  if (!facilities) return null
  const rows = facilities
    .filter((f) => f.powerMw != null && f.powerMw > 0 && f.capexUsdBn != null && f.capexUsdBn > 0)
    .sort((a, b) => (b.powerMw ?? 0) - (a.powerMw ?? 0))
    .slice(0, 8)
    .map((f) => [shortTitle(f.name, 22), Math.round(f.powerMw as number), r2(f.capexUsdBn as number)] as [string, number, number])
  if (rows.length < MIN_CHART_ROWS) return null
  return {
    section,
    title: 'Frontier AI sites: power against capital cost',
    caption: `Each point is a site in Epoch AI's frontier register with both a stated power capacity and a stated capital cost — the further above the trend, the more each megawatt cost to build.`,
    spec: {
      chartType: 'Scatter Plot',
      columns: [
        { name: 'Site', semanticType: 'Name' },
        { name: 'Power (MW)', semanticType: 'Quantity' },
        { name: 'Capital cost (USD bn)', semanticType: 'Amount' },
      ],
      rows,
      encodings: { x: 'Power (MW)', y: ['Capital cost (USD bn)'], color: 'Site' },
    },
    sources: [SOURCES.epoch],
    storyIds: [],
  }
}

/** The largest frontier sites by stated power, from Epoch's register. */
export function facilityPower(section: EditionChartSection, facilities: DcFacility[] | undefined): ValidatedChartPlan | null {
  if (!facilities) return null
  const rows = facilities
    .filter((f) => f.powerMw != null && f.powerMw > 0)
    .sort((a, b) => (b.powerMw ?? 0) - (a.powerMw ?? 0))
    .slice(0, 8)
    .map((f) => [shortTitle(f.name, 26), Math.round(f.powerMw as number)] as [string, number])
  if (rows.length < MIN_CHART_ROWS) return null
  return {
    section,
    title: 'Largest frontier AI sites, by stated power',
    caption: `Power capacity as Epoch AI records it for the ${rows.length} largest sites in its frontier data-center register — the scale today's announcements land against.`,
    spec: {
      chartType: 'Lollipop Chart',
      columns: [
        { name: 'Site', semanticType: 'Name' },
        { name: 'Power (MW)', semanticType: 'Quantity' },
      ],
      rows,
      encodings: { x: 'Site', y: ['Power (MW)'] },
    },
    sources: [SOURCES.epoch],
    storyIds: [],
  }
}

/** Frontier AI power by country, summed over Epoch's register — the energy chapter's view of the same dataset. */
export function facilityPowerByCountry(section: EditionChartSection, facilities: DcFacility[] | undefined): ValidatedChartPlan | null {
  if (!facilities) return null
  const byCountry = new Map<string, { mw: number; sites: number }>()
  for (const f of facilities) {
    if (f.powerMw == null || f.powerMw <= 0 || !f.country) continue
    const cur = byCountry.get(f.country) ?? { mw: 0, sites: 0 }
    cur.mw += f.powerMw
    cur.sites += 1
    byCountry.set(f.country, cur)
  }
  const rows = [...byCountry.entries()]
    .sort((a, b) => b[1].mw - a[1].mw)
    .slice(0, 8)
    .map(([country, v]) => [`${country} (${v.sites} site${v.sites === 1 ? '' : 's'})`, Math.round(v.mw)] as [string, number])
  if (rows.length < MIN_CHART_ROWS) return null
  return {
    section,
    title: 'Frontier AI power on the record, by country',
    caption: `Stated power capacity summed across the frontier sites Epoch AI records in each country — where the grid load of the build-out actually sits.`,
    spec: {
      chartType: 'Bar Chart',
      columns: [
        { name: 'Country', semanticType: 'Country' },
        { name: 'Power (MW)', semanticType: 'Quantity' },
      ],
      rows,
      encodings: { x: 'Country', y: ['Power (MW)'] },
    },
    sources: [SOURCES.epoch],
    storyIds: [],
  }
}

/** Power committed per edition, from the editions' own record; gaps are dropped, not drawn as zero. */
export function powerPerEdition(section: EditionChartSection, perEdition: EditionEnergy['perEdition'] | undefined): ValidatedChartPlan | null {
  if (!perEdition) return null
  const told = perEdition.filter((e) => e.gw != null && e.gw > 0)
  if (told.length < MIN_CHART_ROWS) return null
  const rows = told.map((e) => [e.label, r1(e.gw as number)] as [string, number])
  return {
    section,
    title: 'Power committed per edition',
    caption: `Capacity committed in deals that stated a figure, per edition that disclosed any; ${perEdition.length - told.length} of the last ${perEdition.length} editions disclosed none and are left out rather than drawn as zero.`,
    spec: {
      chartType: 'Line Chart',
      columns: [
        { name: 'Edition', semanticType: 'Category' },
        { name: 'Committed (GW)', semanticType: 'Quantity' },
      ],
      rows,
      encodings: { x: 'Edition', y: ['Committed (GW)'] },
    },
    sources: [SOURCES.editions],
    storyIds: [],
  }
}

/**
 * Gains by paper, for the unit most papers report in — points with points,
 * multipliers with multipliers — so the axis is one scale rather than the
 * normalised blend the scatter draws.
 */
export function paperGains(section: EditionChartSection, papers: DcPaper[] | undefined): ValidatedChartPlan | null {
  if (!papers) return null
  const withGain = papers
    .map((p) => ({ p, unit: gainUnit(p), gain: gainValue(p) }))
    .filter((x): x is { p: DcPaper; unit: string; gain: number } => x.unit != null && x.gain != null && x.gain > 0)
  const byUnit = new Map<string, typeof withGain>()
  for (const x of withGain) byUnit.set(x.unit, [...(byUnit.get(x.unit) ?? []), x])
  const best = [...byUnit.entries()].sort((a, b) => b[1].length - a[1].length)[0]
  if (!best || best[1].length < MIN_CHART_ROWS) return null
  const [unit, items] = best
  const rows = items
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 8)
    .map((x) => [`${shortTitle(x.p.title, 30)}${x.p.bench ? ` · ${shortTitle(x.p.bench, 14)}` : ''}`, r1(x.gain)] as [string, number])
  const unitWord = unit === 'pts' ? 'benchmark points over baseline' : unit === '×' ? 'speed-up multiple' : 'percent gain'
  return {
    section,
    title: `Reported gains today, ${unit === 'pts' ? 'in points' : unit === '×' ? 'as multiples' : 'in percent'}`,
    caption: `${rows.length} of ${papers.length} kept papers report their headline result as a ${unitWord}; papers reporting in other units are not put on this axis.`,
    spec: {
      chartType: 'Lollipop Chart',
      columns: [
        { name: 'Paper', semanticType: 'Name' },
        { name: unit === 'pts' ? 'Gain (pts)' : unit === '×' ? 'Speed-up (×)' : 'Gain (%)', semanticType: 'Quantity' },
      ],
      rows,
      encodings: { x: 'Paper', y: [unit === 'pts' ? 'Gain (pts)' : unit === '×' ? 'Speed-up (×)' : 'Gain (%)'] },
    },
    sources: [SOURCES.arxiv],
    storyIds: [],
  }
}

/** Papers by field today against the 30-edition average — the fields card as a grouped bar. */
export function papersByField(section: EditionChartSection, papers: DcPaper[] | undefined, baseline: Record<DcPaperArea, number> | undefined): ValidatedChartPlan | null {
  if (!papers || papers.length === 0) return null
  const rows: Array<[string, string, number]> = []
  for (const k of DC_PAPER_AREA_KEYS) {
    const today = papers.filter((p) => p.area === k).length
    const base = baseline?.[k] ?? 0
    if (today === 0 && base === 0) continue
    rows.push([DC_PAPER_AREAS[k], 'Today', today])
    rows.push([DC_PAPER_AREAS[k], '30-edition average', r1(base)])
  }
  if (rows.length < MIN_CHART_ROWS * 2) return null
  return {
    section,
    title: 'Papers by field, today against the average',
    caption: `Kept papers per field this edition beside the 30-edition average, so a busy field reads as busy against its own norm.`,
    spec: {
      chartType: 'Grouped Bar Chart',
      columns: [
        { name: 'Field', semanticType: 'Category' },
        { name: 'Series', semanticType: 'Category' },
        { name: 'Papers', semanticType: 'Count' },
      ],
      rows,
      encodings: { x: 'Field', y: ['Papers'], color: 'Series' },
    },
    sources: [SOURCES.arxiv],
    storyIds: [],
  }
}

function gainUnit(p: DcPaper): string | null {
  if (p.result == null) return null
  if (p.unit === '×' || p.unit === 'x') return '×'
  if (p.unit === '%') return '%'
  if (p.unit === 'pts' && p.baseline != null) return 'pts'
  return null
}

function gainValue(p: DcPaper): number | null {
  if (p.result == null) return null
  if (p.unit === '×' || p.unit === 'x') return p.result
  if (p.unit === '%') return Math.abs(p.result)
  if (p.unit === 'pts' && p.baseline != null) return p.result - p.baseline
  return null
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The ladder's last rung for a section: the first builder that draws. Order
 * is "closest to the section's subject first": a data-center chart from the
 * facility register before one from stock moves, energy from its own
 * per-edition series before the register, research from gains before
 * field counts.
 */
export function recordChart(section: EditionChartSection, record: RecordInputs, exclude: Set<string> = new Set()): RecordChart | null {
  const ladder: Array<[string, () => ValidatedChartPlan | null]> = (() => {
    switch (section) {
      // The three stock layers each get a different reading of the same
      // window — the path (line), the endpoints (diverging bar), the change
      // (slope) — so the page never shows one chart three times; each keeps
      // the others as fallbacks when its data is short.
      case 'dc':
        return [
          ['facility-power-vs-capex', () => facilityPowerVsCapex(section, record.facilities)],
          ['facility-power', () => facilityPower(section, record.facilities)],
          ['tape:data-centers', () => tapeMoves(section, record.tape)],
        ]
      case 'hyper':
        return [
          ['line:hyperscalers', () => indexedCloses(section, record.market)],
          ['tape:hyperscalers', () => tapeMoves(section, record.tape)],
        ]
      case 'semi':
        return [
          ['tape:semiconductors', () => tapeMoves(section, record.tape)],
          ['slope:semiconductors', () => slopeMoves(section, record.market)],
        ]
      case 'equip':
        return [
          ['slope:semi-equipment', () => slopeMoves(section, record.market)],
          ['line:semi-equipment', () => indexedCloses(section, record.market)],
          ['tape:semi-equipment', () => tapeMoves(section, record.tape)],
        ]
      case 'energy':
        return [
          ['power-per-edition', () => powerPerEdition(section, record.perEdition)],
          ['facility-power-by-country', () => facilityPowerByCountry(section, record.facilities)],
          ['facility-power', () => facilityPower(section, record.facilities)],
        ]
      case 'research':
        return [
          ['paper-gains', () => paperGains(section, record.papers)],
          ['papers-by-field', () => papersByField(section, record.papers, record.fieldBaseline)],
        ]
    }
  })()
  for (const [key, build] of ladder) {
    if (exclude.has(key)) continue
    const plan = build()
    if (plan) return { key, plan }
  }
  return null
}
