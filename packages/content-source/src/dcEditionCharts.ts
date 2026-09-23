/**
 * Composer-planned charts — the pure half.
 *
 * The composer asks a model, per section of the edition, for ONE comparison
 * worth drawing from the day's stated figures, as a compact flint spec
 * (columns + rows + channel encodings). This module is everything about that
 * plan that needs no model and no renderer: the input the model sees (the
 * figures per section, with the v3 tags that make them comparable), the
 * validation that turns a raw plan into an {@link EditionChart} the page can
 * trust, and the membership pruning the admin needs.
 *
 * Grounding is the same contract the key notes use: every numeric cell must
 * be a figure one of the cited stories states — as written, in base units,
 * or in the headline / summary text — or the plan is rejected and the section
 * falls back to its deterministic template. A chart this page shows can only
 * ever be a rearrangement of what the record already says.
 *
 * Compiling the spec through flint and rendering it to SVG happens in the
 * composer script (apps/vizmaya-fyi/scripts/ai-data-centers/editionCharts.ts):
 * `@vismay/story-pipeline` depends on this package, so the flint side can't
 * live here without a cycle.
 */

import {
  DC_LAYERS,
  DC_THEMES,
  EDITION_CHART_SECTIONS,
  type DcEditionStory,
  type DcLayerKey,
  type DcStoryFigure,
  type EditionChart,
  type EditionChartSection,
  type EditionChartSkip,
  type EditionChartSpec,
  type EditionCharts,
  type EditionSource,
} from './dcEditionTypes'
import { figureKind, figureMagnitude, storySource } from './dcEditionAssembly'

/**
 * A chart with fewer rows is a sentence, not a chart. Two bars invite a
 * comparison the reader can make from the numbers alone; three is where a
 * shape starts to carry something.
 */
export const MIN_CHART_ROWS = 3
export const MAX_CHART_ROWS = 12
/**
 * A measure column whose largest value is more than this many times its
 * smallest is not one scale: every bar but one becomes a sliver, which is the
 * "20 GW target beside a 2.5 MW cooler" rail this replaces.
 */
export const MAX_RANGE_RATIO = 50

/** Sections and the stories each one may draw from. */
export function sectionStories(section: EditionChartSection, stories: DcEditionStory[], ieaStories: DcEditionStory[]): DcEditionStory[] {
  if (section === 'energy') return [...stories.filter((s) => s.energy), ...ieaStories]
  return stories.filter((s) => s.layer === section)
}

export const SECTION_NAMES: Record<EditionChartSection, string> = {
  energy: 'AI + Energy & Sustainability',
  dc: DC_LAYERS.dc.name,
  hyper: DC_LAYERS.hyper.name,
  semi: DC_LAYERS.semi.name,
  equip: DC_LAYERS.equip.name,
}

/** One figure as the planner sees it — the story index it may cite plus the tags that decide comparability. */
export interface PlannerFigure {
  idx: number
  value: number
  unit: string
  base: number | null
  kind: string
  label: string
  subject: string | null
  scope: string | null
  status: string | null
}

export interface PlannerSectionInput {
  section: EditionChartSection
  name: string
  storyCount: number
  stories: { idx: number; outlet: string | null; headline: string; theme: string | null; action: string | null; horizon: string | null }[]
  figures: PlannerFigure[]
}

/**
 * The per-section input for the planner. `idx` is the story's position in
 * the edition's story list (the same indices the prose pass cites) so one
 * grounding path serves both. The energy section indexes IEA stories after
 * the news stories.
 */
export function plannerInput(stories: DcEditionStory[], ieaStories: DcEditionStory[]): PlannerSectionInput[] {
  const all = [...stories, ...ieaStories]
  const idxOf = new Map(all.map((s, i) => [s.id, i]))
  return EDITION_CHART_SECTIONS.map((section) => {
    const inSection = sectionStories(section, stories, ieaStories)
    const figures: PlannerFigure[] = []
    for (const s of inSection) {
      const idx = idxOf.get(s.id)
      if (idx == null) continue
      for (const f of s.facts?.figures ?? []) {
        figures.push({
          idx,
          value: f.value,
          unit: f.unit,
          base: figureMagnitude(f),
          kind: figureKind(f.unit),
          label: f.label,
          subject: f.subject ?? null,
          scope: f.scope ?? null,
          status: f.status ?? null,
        })
      }
    }
    return {
      section,
      name: SECTION_NAMES[section],
      storyCount: inSection.length,
      stories: inSection
        .filter((s) => idxOf.has(s.id))
        .map((s) => ({
          idx: idxOf.get(s.id)!,
          outlet: s.source,
          headline: s.title,
          theme: s.theme ? DC_THEMES[s.theme].name : null,
          action: s.facts?.action ?? null,
          horizon: s.facts?.horizon ? `${s.facts.horizon.from ?? '…'} → ${s.facts.horizon.to ?? '…'}` : null,
        })),
      figures,
    }
  })
}

/** The raw plan for one section, as the model emits it (validated below). */
export interface RawChartPlan {
  section?: unknown
  title?: unknown
  caption?: unknown
  chartType?: unknown
  columns?: unknown
  rows?: unknown
  /** One story idx per row — the story that states that row's numbers. */
  rowSourceIdxs?: unknown
  encodings?: unknown
  xLabel?: unknown
  yLabel?: unknown
}

export type ValidatedChartPlan = Omit<EditionChart, 'svg' | 'width' | 'height' | 'model' | 'generatedAt'>

export type ChartPlanVerdict = { ok: true; plan: ValidatedChartPlan } | { ok: false; reason: string }

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * Every number a story puts on the record, as strings the grounding test can
 * match: each figure's value and base (and its GW→MW / MW→GW twins), plus
 * every numeral in the headline and summary.
 */
function statedNumbers(s: DcEditionStory): Set<number> {
  const out = new Set<number>()
  const add = (n: number | null | undefined) => {
    if (n != null && Number.isFinite(n)) out.add(round(n))
  }
  for (const f of s.facts?.figures ?? []) {
    add(f.value)
    add(figureMagnitude(f))
    if (figureKind(f.unit) === 'power') {
      add(f.value * 1000)
      add(f.value / 1000)
    }
    if (figureKind(f.unit) === 'money') {
      add(f.value * 1000)
      add(f.value / 1000)
    }
  }
  const text = `${s.title} ${s.summary ?? ''}`.replace(/,(?=\d{3})/g, '')
  for (const m of text.match(/\d+(?:\.\d+)?/g) ?? []) add(Number(m))
  return out
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** A numeric cell is stated when it matches one of the story's numbers within half a percent. */
function isStated(n: number, stated: Set<number>): boolean {
  const r = round(n)
  if (stated.has(r)) return true
  for (const s of stated) {
    if (s === 0) continue
    if (Math.abs(s - r) / Math.abs(s) <= 0.005) return true
  }
  return false
}

/**
 * Validate one raw plan against the stories it may cite. Returns the
 * grounded plan, or the reason it was refused — printed in the admin so an
 * editor can see why a section fell back to its template.
 */
export function validateChartPlan(
  raw: RawChartPlan,
  section: EditionChartSection,
  allStories: DcEditionStory[],
  allowedStoryIds: Set<number>,
): ChartPlanVerdict {
  const title = str(raw.title, 90)
  const caption = str(raw.caption, 280)
  const chartType = str(raw.chartType, 40)
  if (!title) return { ok: false, reason: 'no title' }
  if (!chartType) return { ok: false, reason: 'no chart type' }

  const columns = Array.isArray(raw.columns)
    ? raw.columns
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .map((c) => ({ name: str(c.name, 60), semanticType: str(c.semanticType, 32) || 'Category' }))
        .filter((c) => c.name)
    : []
  if (columns.length < 2) return { ok: false, reason: 'fewer than two columns' }
  if (new Set(columns.map((c) => c.name)).size !== columns.length) return { ok: false, reason: 'duplicate column names' }

  const rawRows = Array.isArray(raw.rows) ? raw.rows : []
  const rowIdxs = Array.isArray(raw.rowSourceIdxs) ? raw.rowSourceIdxs : []
  if (rawRows.length < MIN_CHART_ROWS) return { ok: false, reason: `only ${rawRows.length} row${rawRows.length === 1 ? '' : 's'} — a chart needs ${MIN_CHART_ROWS}` }
  if (rowIdxs.length !== rawRows.length) return { ok: false, reason: 'every row needs the story it comes from' }

  const rows: Array<Array<string | number>> = []
  const storyIds: number[] = []
  const sources: EditionSource[] = []
  const numericStated = new Map<number, Set<number>>()
  for (let i = 0; i < rawRows.length && rows.length < MAX_CHART_ROWS; i++) {
    const r = rawRows[i]
    const idx = rowIdxs[i]
    if (!Array.isArray(r) || r.length !== columns.length) return { ok: false, reason: `row ${i + 1} does not have one value per column` }
    if (!Number.isInteger(idx) || (idx as number) < 0 || (idx as number) >= allStories.length) return { ok: false, reason: `row ${i + 1} cites no story` }
    const story = allStories[idx as number]
    if (!allowedStoryIds.has(story.id)) return { ok: false, reason: `row ${i + 1} cites a story outside the ${SECTION_NAMES[section]} section` }
    let stated = numericStated.get(story.id)
    if (!stated) {
      stated = statedNumbers(story)
      numericStated.set(story.id, stated)
    }
    const row: Array<string | number> = []
    for (let c = 0; c < r.length; c++) {
      const cell = r[c]
      if (typeof cell === 'number') {
        if (!Number.isFinite(cell)) return { ok: false, reason: `row ${i + 1} has a non-finite number` }
        if (!isStated(cell, stated)) return { ok: false, reason: `row ${i + 1}: ${cell} is not a figure "${story.source ?? 'the story'}" states` }
        row.push(cell)
      } else if (typeof cell === 'string') {
        row.push(cell.trim().slice(0, 80))
      } else {
        return { ok: false, reason: `row ${i + 1} has an empty cell` }
      }
    }
    rows.push(row)
    if (!storyIds.includes(story.id)) {
      storyIds.push(story.id)
      sources.push(storySource(story))
    }
  }
  if (!rows.some((r) => r.some((c) => typeof c === 'number'))) return { ok: false, reason: 'no numeric column' }
  for (let c = 0; c < columns.length; c++) {
    const vals = rows.map((r) => r[c]).filter((v): v is number => typeof v === 'number' && v > 0)
    if (vals.length < 2 || /^(year|yearmonth|date|quarter|month|decade)$/i.test(columns[c].semanticType)) continue
    const ratio = Math.max(...vals) / Math.min(...vals)
    if (ratio > MAX_RANGE_RATIO) return { ok: false, reason: `"${columns[c].name}" spans ${Math.round(ratio)}× — not one scale (limit ${MAX_RANGE_RATIO}×)` }
  }

  const encodings: Record<string, string | string[]> = {}
  const names = new Set(columns.map((c) => c.name))
  if (raw.encodings && typeof raw.encodings === 'object') {
    for (const [channel, v] of Object.entries(raw.encodings as Record<string, unknown>)) {
      if (typeof v === 'string' && names.has(v)) encodings[channel] = v
      else if (Array.isArray(v)) {
        const cols = v.filter((x): x is string => typeof x === 'string' && names.has(x))
        if (cols.length) encodings[channel] = cols
      }
    }
  }
  if (Object.keys(encodings).length === 0) return { ok: false, reason: 'encodings reference no known column' }

  const spec: EditionChartSpec = { chartType, columns, rows, encodings }
  const xLabel = str(raw.xLabel, 60)
  const yLabel = str(raw.yLabel, 60)
  if (xLabel) spec.xLabel = xLabel
  if (yLabel) spec.yLabel = yLabel

  return {
    ok: true,
    plan: {
      section,
      title,
      caption: caption || `Figures as stated by ${sources.map((s) => s.name).join(', ')}.`,
      spec,
      sources,
      storyIds,
    },
  }
}

/**
 * Keep only the charts whose every source story is still in the edition —
 * an editor dropping a story from the membership drops the chart that quoted
 * it, and the section falls back to its template.
 */
export function pruneChartsForMembership(charts: EditionCharts, storyIds: number[], ieaIds: number[]): EditionCharts {
  const keep = new Set([...storyIds, ...ieaIds])
  const out: EditionCharts = {}
  for (const section of EDITION_CHART_SECTIONS) {
    const c = charts[section]
    if (c && c.storyIds.every((id) => keep.has(id))) out[section] = c
  }
  return out
}

function isSection(v: unknown): v is EditionChartSection {
  return typeof v === 'string' && (EDITION_CHART_SECTIONS as string[]).includes(v)
}

/** Row → typed charts; anything malformed is dropped rather than rendered. */
export function normaliseCharts(raw: unknown): EditionCharts {
  const out: EditionCharts = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSection(k) || !v || typeof v !== 'object') continue
    const c = v as Record<string, unknown>
    const spec = c.spec as Partial<EditionChartSpec> | undefined
    if (!spec || !Array.isArray(spec.columns) || !Array.isArray(spec.rows) || typeof spec.chartType !== 'string') continue
    out[k] = {
      section: k,
      title: typeof c.title === 'string' ? c.title : '',
      caption: typeof c.caption === 'string' ? c.caption : '',
      spec: {
        chartType: spec.chartType,
        columns: spec.columns as EditionChartSpec['columns'],
        rows: spec.rows as EditionChartSpec['rows'],
        encodings: (spec.encodings as EditionChartSpec['encodings']) ?? {},
        ...(typeof spec.xLabel === 'string' ? { xLabel: spec.xLabel } : {}),
        ...(typeof spec.yLabel === 'string' ? { yLabel: spec.yLabel } : {}),
      },
      sources: Array.isArray(c.sources) ? (c.sources as EditionSource[]) : [],
      storyIds: Array.isArray(c.storyIds) ? (c.storyIds as unknown[]).map(Number).filter(Number.isFinite) : [],
      svg: typeof c.svg === 'string' && c.svg.startsWith('<svg') ? c.svg : null,
      width: Number(c.width) || 0,
      height: Number(c.height) || 0,
      model: typeof c.model === 'string' ? c.model : '',
      generatedAt: typeof c.generatedAt === 'string' ? c.generatedAt : '',
    }
  }
  return out
}

export function normaliseChartSkips(raw: unknown): EditionChartSkip[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .filter((x) => isSection(x.section) && typeof x.reason === 'string')
    .map((x) => ({ section: x.section as EditionChartSection, reason: x.reason as string }))
}

/** The figure fields the v3 classifier adds, as a short line for prompts and logs. */
export function describeFigure(f: DcStoryFigure): string {
  const tags = [f.subject, f.scope, f.status].filter(Boolean).join(' · ')
  return `${f.value} ${f.unit} ${f.label}${tags ? ` (${tags})` : ''}`
}

export type { DcLayerKey }
