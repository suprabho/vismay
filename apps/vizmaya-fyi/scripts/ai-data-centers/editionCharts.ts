/**
 * Composer-planned charts — the model + renderer half.
 *
 * For each section of the edition (energy + the four AI layers) the planner
 * shows the model the figures the section's stories state — with the v3 tags
 * (subject, scope, status, base unit) that decide which of them may share a
 * scale — and asks for ONE comparison worth drawing, as a compact flint spec:
 * columns with semantic types, rows, channel encodings, one story index per
 * row. Or a skip with a reason. The same vocabulary the story composer uses
 * (`@vismay/story-pipeline` chartVocab), compiled through the same
 * `buildEChartsOption`, so a chart here is built the way a story chart is.
 *
 * Every plan then passes the grounding test in
 * `@vismay/content-source/dcEditionCharts` (each numeric cell must be a figure
 * the row's story states; ≥ 3 rows), is compiled to an ECharts option, themed
 * to the edition's palette, and rendered to an SVG string with ECharts' SSR
 * renderer. The page inlines the SVG and swaps the palette hexes for CSS
 * variables, so the chart follows the light / dark theme and ships no client
 * chart code — the row stays the page.
 *
 * Anything that fails (a refused plan, a compile error, a render error) is a
 * skip with a reason; the section falls back to its deterministic template.
 */

import * as echarts from 'echarts'
import { z } from 'zod'
import { generateText, MODELS } from '@vismay/ai-gateway'
import { buildEChartsOption, type ChartSpec, type ChartType } from '@vismay/story-pipeline'
import { CHART_TYPES, RELATIONSHIP_CHART_TYPES, SEMANTIC_TYPE_HINTS } from '@vismay/story-pipeline/chartVocab'
import {
  EDITION_CHART_SECTIONS,
  type DcEditionStory,
  type DcPaper,
  type EditionChart,
  type EditionChartSection,
  type EditionChartSkip,
  type EditionChartSpec,
  type EditionCharts,
} from '@vismay/content-source/dcEditionTypes'
import {
  MAX_CHART_ROWS,
  MAX_RANGE_RATIO,
  MIN_CHART_ROWS,
  plannerInput,
  sectionStories,
  validateChartPlan,
  type PlannerSectionInput,
} from '@vismay/content-source/dcEditionCharts'
import { AI_DATA_CENTERS_THEME_DEFAULTS as T } from '../../app/ai-data-centers/theme'
import { recordChart, type RecordInputs } from './editionChartFallbacks'

/**
 * ECharts' server-side renderer has no font metrics: it estimates every
 * label at a fixed fraction of the font size, which runs well short of the
 * edition's mono face (0.6em per glyph). A label it thinks fits its width
 * gets anchored at the axis and drawn wider than the estimate — off the left
 * edge of the card. Give the renderer the real measure: everything on these
 * charts is set in the sentinel mono face, so width is glyph count × 0.6em
 * (with a little more for the sans fallback ECharts uses for its own text).
 */
echarts.setPlatformAPI({
  measureText(text: string, font?: string): { width: number } {
    const size = Number((font ?? '').match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 12)
    const mono = (font ?? '').includes(CHART_FONT_SENTINEL)
    return { width: Array.from(text).length * size * (mono ? 0.62 : 0.56) }
  },
})

/** Tabular templates only — the relationship ones take edge rows the figures never form. */
const PLANNABLE_CHART_TYPES = CHART_TYPES.filter((t) => !(RELATIONSHIP_CHART_TYPES as readonly string[]).includes(t))

/** Rendered size per section: the energy hero card is wide, the layer tiles are half-width. */
export const CHART_SIZES: Record<EditionChartSection, { width: number; height: number }> = {
  energy: { width: 800, height: 340 },
  dc: { width: 480, height: 260 },
  hyper: { width: 480, height: 260 },
  semi: { width: 480, height: 260 },
  equip: { width: 480, height: 260 },
  research: { width: 560, height: 300 },
}

/**
 * The ladder. Rung 1 is the planner over today's figures. Rungs 2 and 3
 * (today against the trailing record; today against a dataset) are the
 * chart agent's, coming next. Rung 4 is the record alone, in code, so every
 * section that has any record at all gets a chart.
 */

// ---------------------------------------------------------------------------
// The plan

const PLANNER_SYSTEM = `You are the chart editor of "AI Data Centers Daily", a frozen morning edition for operators, investors, analysts and policy people. For each section of today's edition you decide whether the figures its stories put on the record add up to ONE comparison worth drawing — and if so, you specify that chart exactly.

You receive, per section, the section's stories (idx, outlet, headline, theme, action, horizon) and every FIGURE they state, each with: idx (the story it comes from), value + unit as written, base (the same figure in the dimension's base unit: MW, MWh, USD millions, or the bare number for a share), kind (power / energy / money / share / horizon / term / count), label, subject (the entity it belongs to), scope (site / company / market / policy) and status (committed / target / forecast / queued / stated).

A chart is worth drawing when at least ${MIN_CHART_ROWS} figures compare honestly on one scale. Honest means:
- same kind (never a percentage on a power axis; never money against MW);
- compatible status — committed with committed, target with target, forecast with forecast. A target and a built site never share a bar. If you must show a target beside commitments, say so in the caption and put status in a category column so they are visibly different;
- compatible scope — a global or national total never sits beside one site's figure as if they were peers, unless the chart is explicitly "one site against the market" and the caption says so;
- one row per subject — two outlets reporting the same figure for the same subject are one row (cite one of them); the same subject stated twice with different numbers is one row with the larger, cited once;
- every numeric cell is a figure's value or base EXACTLY as listed (you may use base units so all rows share a unit — then name the unit in the column name, e.g. "Capacity (MW)"); never compute, sum, average, convert by hand or estimate anything;
- one readable scale — the largest value in a measure column may be at most ${MAX_RANGE_RATIO}× the smallest. A 200 GW queue beside 900 MW deals makes every bar but one a sliver; leave the outlier out (or skip) rather than explain it in the caption.

Prefer the comparison that carries the day's story: what was committed, where the money went, who is booked out to when. Choose the form for the comparison, not by habit: a Lollipop Chart for a ranking of subjects, a Bar Chart when the reader compares lengths, a Grouped Bar Chart when a status or region split is the point, a Scatter Plot when two stated measures relate (capacity against money, gain against scale), a Slope Chart or Line Chart when the same subjects are stated at two horizons, a Waterfall Chart when parts add to a stated total. Row labels are subjects, never outlets. Keep it to ${MAX_CHART_ROWS} rows.

Chart types: ${PLANNABLE_CHART_TYPES.join(', ')}.
Semantic types: ${SEMANTIC_TYPE_HINTS}.
Encodings map channels to column names: x, y (an array of measure columns), color (category split), size, angle/value (pie / funnel measure), group. A bar chart of capacity by subject is {"x": "Subject", "y": ["Capacity (MW)"]}.

For each section return either a chart or a skip with a plain reason ("only two committed power figures", "figures are all different kinds", "one story"). Skipping is the right answer more often than not — a chart with two bars or mixed scales is worse than no chart. Titles are ≤ 9 words naming the comparison ("Power committed today, by site"); the caption is one sentence that reads the chart for the reader and carries any caveat.`

const chartSchema = z.object({
  title: z.string(),
  caption: z.string(),
  chartType: z.string(),
  columns: z.array(z.object({ name: z.string(), semanticType: z.string() })),
  rows: z.array(z.array(z.union([z.string(), z.number()]))),
  rowSourceIdxs: z.array(z.number().int()).describe('One story idx per row — the story whose figure the row quotes.'),
  encodings: z.object({
    x: z.string().optional(),
    y: z.array(z.string()).optional(),
    color: z.string().optional(),
    size: z.string().optional(),
    angle: z.string().optional(),
    value: z.string().optional(),
    group: z.string().optional(),
    detail: z.string().optional(),
  }),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
})

/** One section's answer: a chart, or a skip with the reason. */
const sectionPlanSchema = z.object({
  skip: z.string().nullable().describe('Why no chart is drawn for this section; null when `chart` is set.'),
  chart: chartSchema.nullable(),
})
type SectionPlan = z.infer<typeof sectionPlanSchema>

/**
 * Lenient reading of a plain-text answer: the JSON object, with or without
 * fences, with or without prose around it. Used when the provider's
 * constrained-output path refuses the model's object — which it does now and
 * then for a nested shape like this one — so a formatting hiccup costs a
 * retry, not the section.
 */
function parseLooseJson(text: string): unknown {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Ask for one section's plan. First the constrained-output path (the
 * provider guarantees the shape); if that fails for any reason, once more as
 * plain text with the same instructions, parsed leniently and checked against
 * the same zod schema. Throws only when both fail.
 */
async function askSection(
  section: PlannerSectionInput,
  model: string,
  log: (l: string) => void,
  feedback?: { plan: unknown; reason: string },
): Promise<{ plan: SectionPlan; modelUsed: string }> {
  const prompt =
    `Plan the chart for this section (answer for this section only):\n${JSON.stringify(compactSection(section), null, 1)}` +
    (feedback
      ? `\n\nYour previous plan was refused by the validator — "${feedback.reason}". It was:\n${JSON.stringify(feedback.plan)}\n` +
        `Plan again: drop the rows that break the rule (or skip with a reason) rather than explain it in the caption.`
      : '')
  try {
    const res = await generateText({
      model,
      system: PLANNER_SYSTEM,
      prompt,
      schema: sectionPlanSchema,
      temperature: 0.2,
      maxOutputTokens: 4000,
      metadata: { 'x-vismay-feature': 'dc-edition-charts' },
    })
    return { plan: res.result, modelUsed: res.modelUsed }
  } catch (err) {
    const e = err as { message?: string; text?: string; finishReason?: string }
    log(`[charts] ${section.section}: constrained output failed (${e.message ?? err}${e.finishReason ? `, finish=${e.finishReason}` : ''}) — retrying as plain JSON`)
    if (typeof e.text === 'string') log(`[charts] ${section.section}: raw text (${e.text.length} chars): ${e.text.slice(0, 300)} …`)
  }
  const res = await generateText({
    model,
    system: `${PLANNER_SYSTEM}\n\nRespond with ONE JSON object and nothing else: {"skip": string | null, "chart": {title, caption, chartType, columns:[{name, semanticType}], rows:[[…]], rowSourceIdxs:[…], encodings:{x?, y?:[…], color?, size?, angle?, value?, group?, detail?}, xLabel?, yLabel?} | null}. Numbers as JSON numbers, not strings.`,
    prompt,
    temperature: 0.2,
    maxOutputTokens: 4000,
    metadata: { 'x-vismay-feature': 'dc-edition-charts-fallback' },
  })
  const parsed = sectionPlanSchema.safeParse(parseLooseJson(res.result))
  if (!parsed.success) throw new Error(`plain-JSON retry did not match the plan shape: ${parsed.error.issues[0]?.message ?? 'unknown'}`)
  return { plan: parsed.data, modelUsed: res.modelUsed }
}

export interface PlanChartsResult {
  charts: EditionCharts
  skips: EditionChartSkip[]
  modelUsed: string | null
}

/** Why rung 1 produced nothing for a section — kept on the skip so the admin can see what the planner said before the record took over. */
type Rung1Outcome = { reason: string }

/**
 * Rung 1 for one section: ask, validate, and on a refusal ask once more with
 * the reason (a 547× outlier gets dropped by the model rather than costing
 * the section). Returns the validated plan or why there is none.
 */
async function planFromToday(
  s: PlannerSectionInput,
  input: { stories: DcEditionStory[]; ieaStories: DcEditionStory[]; model: string },
  all: DcEditionStory[],
  log: (l: string) => void,
): Promise<{ plan: ValidatedPlan; modelUsed: string } | Rung1Outcome> {
  const allowed = new Set(sectionStories(s.section, input.stories, input.ieaStories).map((x) => x.id))
  let feedback: { plan: unknown; reason: string } | undefined
  let modelUsed = input.model
  // Three attempts: on the first real edition the model went 547× → 56× →
  // (would have been) inside the limit; the second retry is what lands it.
  const ATTEMPTS = 3
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let answer: SectionPlan
    try {
      const res = await askSection(s, input.model, log, feedback)
      answer = res.plan
      modelUsed = res.modelUsed || input.model
    } catch (err) {
      return { reason: `chart planner failed: ${err instanceof Error ? err.message : String(err)}` }
    }
    if (!answer.chart) return { reason: answer.skip?.trim() || 'planner skipped it' }
    if (!(PLANNABLE_CHART_TYPES as string[]).includes(answer.chart.chartType)) return { reason: `unknown chart type "${answer.chart.chartType}"` }
    const verdict = validateChartPlan(answer.chart, s.section, all, allowed)
    if (verdict.ok) return { plan: verdict.plan, modelUsed }
    log(`[charts] ${s.section}: refused — ${verdict.reason}${attempt < ATTEMPTS - 1 ? ' (retrying with the reason)' : ''}`)
    feedback = { plan: answer.chart, reason: verdict.reason }
    if (attempt === ATTEMPTS - 1) return { reason: `refused ${ATTEMPTS} times: ${verdict.reason}` }
  }
  return { reason: 'planner produced nothing' }
}

type ValidatedPlan = ReturnType<typeof validateChartPlan> extends infer V ? (V extends { ok: true; plan: infer P } ? P : never) : never

/**
 * Plan, validate, compile and render the edition's charts, one per section,
 * descending the ladder until something draws. Never throws: a section with
 * no honest comparison today and no record to fall back on is a skip with
 * the reason, and the page draws its template.
 */
export async function planEditionCharts(input: {
  stories: DcEditionStory[]
  ieaStories: DcEditionStory[]
  model: string
  log?: (line: string) => void
  /** The standing datasets rung 4 draws from; any of them may be missing. */
  papers?: DcPaper[]
  tape?: RecordInputs['tape']
  market?: RecordInputs['market']
  perEdition?: RecordInputs['perEdition']
  facilities?: RecordInputs['facilities']
  fieldBaseline?: RecordInputs['fieldBaseline']
}): Promise<PlanChartsResult> {
  const log = input.log ?? (() => {})
  const sections = plannerInput(input.stories, input.ieaStories)
  const all = [...input.stories, ...input.ieaStories]
  const record: RecordInputs = { tape: input.tape, market: input.market, facilities: input.facilities, perEdition: input.perEdition, papers: input.papers, fieldBaseline: input.fieldBaseline }
  const skips: EditionChartSkip[] = []
  const charts: EditionCharts = {}
  const generatedAt = new Date().toISOString()
  let modelUsed: string | null = null

  // Rung 1, one call per section in parallel. Research is never asked: its
  // numbers live in dc_papers, not in stories, and rung 4 charts them.
  const askable = sections.filter((s) => s.section !== 'research' && s.figures.length >= MIN_CHART_ROWS)
  const rung1 = new Map<EditionChartSection, Awaited<ReturnType<typeof planFromToday>>>()
  await Promise.all(
    askable.map(async (s) => {
      rung1.set(s.section, await planFromToday(s, input, all, log))
    }),
  )

  // Two sections must not show the same comparison. Sections are placed in
  // page order (the energy hero first); a rung-1 plan that repeats half the
  // rows or stories of one already placed yields and draws from the record,
  // and a record chart already drawn for one section is skipped for the next.
  const usedRecord = new Set<string>()
  const placed = new Map<EditionChartSection, ValidatedPlan>()
  for (const s of sections) {
    const today = rung1.get(s.section)
    const todayReason =
      s.section === 'research'
        ? 'papers are charted from the record'
        : today && 'reason' in today
          ? today.reason
          : s.figures.length === 0
            ? 'no story states a figure'
            : s.figures.length < MIN_CHART_ROWS
              ? `only ${s.figures.length} stated figure${s.figures.length === 1 ? '' : 's'}`
              : null

    let plan: ValidatedPlan | null = null
    let rung: 1 | 4 = 1
    let model = input.model
    let dupOf: EditionChartSection | null = null
    if (today && 'plan' in today) {
      const mine = rowKeys(today.plan)
      for (const [other, theirsPlan] of placed) {
        const theirs = rowKeys(theirsPlan)
        const shared = [...mine].filter((k) => theirs.has(k)).length
        // Row labels are the model's words and differ run to run; the stories
        // the rows quote do not. Either overlap, at half the smaller chart,
        // marks the same comparison.
        const sharedStories = today.plan.storyIds.filter((id) => theirsPlan.storyIds.includes(id)).length
        const half = (a: number, b: number) => Math.ceil(Math.min(a, b) / 2)
        if ((shared >= 2 && shared >= half(mine.size, theirs.size)) || (sharedStories >= 2 && sharedStories >= half(today.plan.storyIds.length, theirsPlan.storyIds.length))) {
          dupOf = other
          break
        }
      }
      if (!dupOf) {
        plan = today.plan
        model = today.modelUsed
        modelUsed = modelUsed ?? today.modelUsed
        placed.set(s.section, today.plan)
      }
    }
    if (!plan) {
      const fallback = recordChart(s.section, record, usedRecord)
      if (fallback) {
        plan = fallback.plan
        rung = 4
        model = 'record'
        usedRecord.add(fallback.key)
      }
    }
    if (dupOf) log(`[charts] ${s.section}: today's plan repeats ${dupOf}'s rows — ${plan ? 'drawing from the record instead' : 'no chart'}`)
    if (!plan) {
      skips.push({ section: s.section, reason: `${todayReason ?? 'no plan'}; nothing in the record to draw either` })
      log(`[charts] ${s.section}: no chart — ${todayReason ?? 'no plan'}`)
      continue
    }
    const size = CHART_SIZES[s.section]
    const svg = renderChartSvg(plan.spec, s.section, size)
    if (!svg.ok) {
      skips.push({ section: s.section, reason: `${rung === 4 ? 'record chart' : 'planned chart'} failed to render: ${svg.reason}` })
      log(`[charts] ${s.section}: render failed — ${svg.reason}`)
      continue
    }
    charts[s.section] = { ...plan, svg: svg.svg, ...size, rung, model, generatedAt }
    if (rung === 4) skips.push({ section: s.section, reason: `rung 4 (${dupOf ? `today's plan repeated ${dupOf}` : (todayReason ?? 'no plan')})` })
    log(`[charts] ${s.section}: rung ${rung} · ${plan.spec.chartType} · ${plan.spec.rows.length} rows · "${plan.title}"`)
  }
  return { charts, skips, modelUsed }
}

/** The subjects a plan draws, normalised, for the cross-section duplicate test. */
function rowKeys(plan: ValidatedPlan): Set<string> {
  const out = new Set<string>()
  for (const row of plan.spec.rows) {
    const label = row.find((c) => typeof c === 'string')
    if (typeof label === 'string') out.add(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24))
  }
  return out
}

/** The section as the model sees it — figures first, stories as the citation key. */
function compactSection(s: PlannerSectionInput) {
  return {
    section: s.section,
    name: s.name,
    stories: s.stories,
    figures: s.figures.map((f) => ({
      idx: f.idx,
      value: f.value,
      unit: f.unit,
      base: f.base,
      kind: f.kind,
      label: f.label,
      subject: f.subject,
      scope: f.scope,
      status: f.status,
    })),
  }
}

// ---------------------------------------------------------------------------
// Compile + render

/**
 * The renderer's `$token` colours → the edition's dark-theme hexes. The page
 * maps these exact hexes back to CSS variables (chartSvg.ts), so the two
 * tables must agree: change one, change the other.
 */
const TOKEN_HEX: Record<EditionChartSection, Record<string, string>> = {
  energy: { $accent: T.energy, $teal: T.comp2, $accent2: T.comp1, $amber: T.comp3, $positive: T.accentHi, $muted: T.muted, $line: T.line },
  dc: { $accent: T.accent, $teal: T.accentMid, $accent2: T.comp2, $amber: T.comp1, $positive: T.accentHi, $muted: T.muted, $line: T.line },
  hyper: { $accent: T.accent, $teal: T.accentMid, $accent2: T.comp2, $amber: T.comp1, $positive: T.accentHi, $muted: T.muted, $line: T.line },
  semi: { $accent: T.accent, $teal: T.accentMid, $accent2: T.comp2, $amber: T.comp1, $positive: T.accentHi, $muted: T.muted, $line: T.line },
  equip: { $accent: T.accent, $teal: T.accentMid, $accent2: T.comp2, $amber: T.comp1, $positive: T.accentHi, $muted: T.muted, $line: T.line },
  research: { $accent: T.accent, $teal: T.accentMid, $accent2: T.comp2, $amber: T.comp1, $positive: T.accentHi, $muted: T.muted, $line: T.line },
}

import { CHART_FONT_SENTINEL } from '../../app/ai-data-centers/daily/components/chartConstants'

function resolveTokens(value: unknown, table: Record<string, string>): unknown {
  if (typeof value === 'string') return value.startsWith('$') ? (table[value] ?? T.muted) : value
  if (Array.isArray(value)) return value.map((v) => resolveTokens(v, table))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = resolveTokens(v, table)
    return out
  }
  return value
}

/** Compile the spec through flint and render it server-side. */
export function renderChartSvg(
  spec: EditionChartSpec,
  section: EditionChartSection,
  size: { width: number; height: number },
): { ok: true; svg: string } | { ok: false; reason: string } {
  let option: Record<string, unknown>
  try {
    const full: ChartSpec = {
      id: `edition-${section}`,
      chartType: spec.chartType as ChartType,
      columns: spec.columns,
      rows: spec.rows,
      encodings: spec.encodings as ChartSpec['encodings'],
      ...(spec.xLabel ? { xLabel: spec.xLabel } : {}),
      ...(spec.yLabel ? { yLabel: spec.yLabel } : {}),
    }
    option = resolveTokens(buildEChartsOption(full), TOKEN_HEX[section]) as Record<string, unknown>
  } catch (err) {
    return { ok: false, reason: `flint could not assemble the spec: ${err instanceof Error ? err.message : String(err)}` }
  }
  tuneForEdition(option, spec, size)
  let chart: echarts.ECharts | null = null
  try {
    chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: size.width, height: size.height })
    chart.setOption(option as echarts.EChartsOption)
    const raw = chart.renderToSVGString()
    const svg = sanitizeSvg(raw, section)
    if (!svg.includes('<path') && !svg.includes('<circle') && !svg.includes('<rect')) return { ok: false, reason: 'render produced an empty chart' }
    return { ok: true, svg }
  } catch (err) {
    return { ok: false, reason: `echarts could not render: ${err instanceof Error ? err.message : String(err)}` }
  } finally {
    chart?.dispose()
  }
}

type Opt = Record<string, unknown>
const obj = (v: unknown): Opt | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Opt) : null)

/**
 * flint frames a chart for an interactive story canvas: tooltip, a legend
 * title drawn as a `graphic`, a right-hand vertical legend, category labels
 * rotated 90° under a deep name gap. The edition card is a static SVG a
 * third that size, so: nothing interactive, the legend across the top,
 * subject labels on the left of horizontal bars (a magnitude-by-subject
 * chart reads down a list, not across rotated text), the edition's mono
 * face everywhere, and a grid that keeps every label inside the box.
 */
function tuneForEdition(option: Opt, spec: EditionChartSpec, size: { width: number; height: number }): void {
  delete option.title
  delete option.tooltip
  delete option.toolbox
  delete option.dataZoom
  delete option.graphic
  option.animation = false
  option.backgroundColor = 'transparent'
  option.textStyle = { fontFamily: CHART_FONT_SENTINEL, fontSize: 11, color: T.muted }

  const legend = obj(option.legend)
  if (legend) {
    delete legend.right
    delete legend.orient
    Object.assign(legend, { top: 0, left: 0, itemWidth: 10, itemHeight: 10, itemGap: 14, textStyle: { color: T.muted, fontSize: 11, fontFamily: CHART_FONT_SENTINEL } })
  }

  const x = obj(option.xAxis)
  const y = obj(option.yAxis)
  const barLike = /bar chart|lollipop/i.test(spec.chartType)
  if (barLike && x?.type === 'category' && y?.type === 'value') {
    // Horizontal bars: category on the left, value along the bottom, first
    // row at the top, labels clipped at a width instead of rotated.
    delete x.nameLocation
    delete x.nameGap
    // Labels take at most a third of the card; longer ones are truncated by
    // the renderer using the real mono measure above.
    const cat: Opt = { ...x, inverse: true, axisLabel: { fontSize: 11, color: T.muted, width: Math.round(size.width * 0.32), overflow: 'truncate', fontFamily: CHART_FONT_SENTINEL }, axisTick: { show: false }, name: undefined }
    const val: Opt = { ...y, nameLocation: 'end', nameGap: 8, nameTextStyle: { fontSize: 10, color: T.dim, fontFamily: CHART_FONT_SENTINEL, align: 'right' }, axisLabel: { fontSize: 10, color: T.dim, fontFamily: CHART_FONT_SENTINEL }, axisLine: { show: false }, splitLine: { lineStyle: { color: T.line } } }
    option.xAxis = val
    option.yAxis = cat
  } else {
    for (const axis of [x, y]) {
      if (!axis) continue
      const label = obj(axis.axisLabel) ?? {}
      delete label.rotate
      axis.axisLabel = { ...label, fontSize: 10, color: T.muted, fontFamily: CHART_FONT_SENTINEL, hideOverlap: true }
      if (axis.nameLocation === 'middle') axis.nameGap = axis === x ? 26 : 40
      axis.nameTextStyle = { fontSize: 10, color: T.dim, fontFamily: CHART_FONT_SENTINEL }
      // A value axis that starts at zero flattens an indexed line (100 → 104
      // becomes a hairline over a 0–120 axis) and squashes a scatter into a
      // corner; let it fit the data with nice ticks. flint pins scatter axes
      // to the exact data extremes, which prints "37.068" as a tick — drop
      // those and let ECharts round. Bars keep their zero baseline.
      if (axis.type === 'value') {
        axis.scale = true
        delete axis.min
        delete axis.max
      }
    }
  }
  const isScatter = /scatter/i.test(spec.chartType)
  const isLollipop = /lollipop/i.test(spec.chartType)
  if (isScatter) delete option.legend
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : []
  const isSlope = /slope/i.test(spec.chartType)
  const multiLine = /line chart|slope/i.test(spec.chartType) && series.length > 1
  // Multi-series lines and slopes name every line at its end, so a legend
  // only repeats them — and a six-entry legend wraps into the plot.
  if (multiLine) delete option.legend
  // A slope's category axis is two named points; "Point" as an axis title says nothing.
  if (isSlope && x) x.name = undefined
  option.grid = { left: 8, right: multiLine ? 104 : 20, top: option.legend && !isScatter ? 34 : 20, bottom: 8, containLabel: true }

  // Bars: a slimmer, rounded mark with the value at its end so the reader
  // never has to trace a gridline.
  for (const s of series) {
    const sr = obj(s)
    if (!sr) continue
    if (sr.type === 'bar' && isLollipop) {
      // The stem: flint's 1.5px bar. No rounding, no label — the head carries
      // the value.
      sr.barWidth = 1.5
      sr.label = { show: false }
    } else if (sr.type === 'bar') {
      sr.barMaxWidth = 18
      sr.itemStyle = { ...(obj(sr.itemStyle) ?? {}), borderRadius: 2 }
      if (barLike && !obj(sr.label)?.show) sr.label = { show: true, position: 'right', fontSize: 10, color: T.bone, fontFamily: CHART_FONT_SENTINEL }
      // A diverging measure (stock moves, changes) reads by sign: falls in
      // the down colour, values that point left, label on the outside.
      if (Array.isArray(sr.data) && sr.data.some((d) => typeof d === 'number' && d < 0)) {
        sr.data = sr.data.map((d) => (typeof d === 'number' && d < 0 ? { value: d, itemStyle: { color: T.down }, label: { position: 'left' } } : d))
      }
    }
    if (sr.type === 'line') {
      // Multi-series lines (indexed closes, slopes) label their ends only —
      // a value on every point of five lines is noise.
      const multi = series.length > 1
      sr.symbolSize = multi ? 5 : 7
      sr.lineStyle = { ...(obj(sr.lineStyle) ?? {}), width: 2 }
      if (!multi && !obj(sr.label)?.show) sr.label = { show: true, position: 'top', fontSize: 10, color: T.bone, fontFamily: CHART_FONT_SENTINEL }
      if (multi) sr.endLabel = { show: true, fontSize: 10, color: T.muted, fontFamily: CHART_FONT_SENTINEL, formatter: '{a}' }
    }
    if (sr.type === 'scatter' && isLollipop) {
      // The head. flint emits its points as [category, value]; after the
      // horizontal swap above the category lives on the y axis, so the pairs
      // flip too — without this the heads land off the plot and the chart
      // reads as bare stems. The value label rides on the head.
      if (barLike && Array.isArray(sr.data)) sr.data = sr.data.map((d) => (Array.isArray(d) && d.length === 2 ? [d[1], d[0]] : d))
      sr.symbolSize = 10
      sr.itemStyle = { ...(obj(sr.itemStyle) ?? {}), borderWidth: 0 }
      sr.label = {
        show: true,
        position: 'right',
        distance: 8,
        fontSize: 10,
        color: T.bone,
        fontFamily: CHART_FONT_SENTINEL,
        formatter: (p: { value: unknown }) => String(Array.isArray(p.value) ? (barLike ? p.value[0] : p.value[1]) : p.value),
      }
    } else if (sr.type === 'scatter') {
      // One series per point (the `color` channel carries the name), so the
      // series name is the label and the legend would only repeat it. Labels
      // that would overlap a neighbour's are hidden rather than stacked.
      sr.symbolSize = 11
      sr.label = { show: true, position: 'right', fontSize: 10, color: T.muted, fontFamily: CHART_FONT_SENTINEL, formatter: '{a}' }
      sr.labelLayout = { hideOverlap: true }
    }
  }
}

/**
 * Strip what a static inline SVG doesn't need and namespace what could
 * collide when five charts share one document: ECharts' `zr0-` ids/classes
 * and its hover `<style>` block, the `ecmeta_*` attributes, the fixed
 * width/height (the viewBox scales it).
 */
export function sanitizeSvg(raw: string, section: EditionChartSection): string {
  return raw
    .replace(/<style\s*>[\s\S]*?<\/style>/g, '')
    .replace(/\s+ecmeta_[a-z_]+="[^"]*"/g, '')
    .replace(/\s+pointer-events="[^"]*"/g, '')
    .replace(/zr\d+-/g, `ec-${section}-`)
    .replace(/^<svg width="\d+" height="\d+"/, '<svg width="100%"')
    .replace(/<rect width="\d+" height="\d+" x="0" y="0" fill="none"><\/rect>\n?/, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * The daily edition's default model: Opus 5.5 by gateway id. Pinned here rather
 * than via `text.opus` so the DC runs move independently of the shared alias.
 */
export const DC_DEFAULT_MODEL = 'anthropic/claude-opus-5.5'

/** The default planner model: DC_DEFAULT_MODEL; COMPOSER_CHART_MODEL overrides (a `text.*` alias or a gateway id). */
export function chartPlannerModel(): string {
  return process.env.COMPOSER_CHART_MODEL || process.env.COMPOSER_MODEL || DC_DEFAULT_MODEL
}

export { MODELS, EDITION_CHART_SECTIONS }
export type { EditionChart }
