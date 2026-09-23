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

import type { DcFacility } from '@vismay/content-source/epics'
import type { DcPaper, EditionChartSection, EditionEnergy, EditionSource, EditionTapeTick } from '@vismay/content-source/dcEditionTypes'
import { DC_PAPER_AREAS, DC_PAPER_AREA_KEYS, type DcPaperArea } from '@vismay/content-source/dcEditionTypes'
import { MIN_CHART_ROWS, type ValidatedChartPlan } from '@vismay/content-source/dcEditionCharts'
import { shortTitle } from '@vismay/content-source/dcEditionAssembly'

/** What rung 4 can draw from. Everything optional: a missing dataset just skips its builders. */
export interface RecordInputs {
  tape?: EditionTapeTick[]
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
      chartType: 'Bar Chart',
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
      chartType: 'Bar Chart',
      columns: [
        { name: 'Edition', semanticType: 'Date' },
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
      chartType: 'Bar Chart',
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
export function recordChart(section: EditionChartSection, record: RecordInputs): ValidatedChartPlan | null {
  switch (section) {
    case 'dc':
      return facilityPower(section, record.facilities) ?? tapeMoves(section, record.tape)
    case 'hyper':
    case 'semi':
    case 'equip':
      return tapeMoves(section, record.tape)
    case 'energy':
      return powerPerEdition(section, record.perEdition) ?? facilityPower(section, record.facilities)
    case 'research':
      return paperGains(section, record.papers) ?? papersByField(section, record.papers, record.fieldBaseline)
  }
}
