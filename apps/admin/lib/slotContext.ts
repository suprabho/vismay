/**
 * Live story/section/data context for the canvas AI calls — the dynamic
 * counterpart to `buildSlotSchemaPrompt` (overrideSchemas.ts).
 *
 * `buildSlotSchemaPrompt` tells the model *what shape* a slot accepts. This
 * tells it *what story it is inside*: the title/format/palette, the section's
 * heading + prose + sibling layers, the real chart ids it may reference, and
 * the grounded facts/data behind them. Both canvas AI routes (generate +
 * transform) prepend the returned block to the USER prompt, leaving the
 * (editable) system prompt as pure role + schema.
 *
 * SERVER ONLY. It pulls from the content-source + Supabase-backed compose state,
 * so it must never be imported into a client component — only the two route
 * handlers call it. Every load is best-effort: a context build can never break a
 * generation, so any failure degrades to a smaller block (or null).
 */

import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getContentSource } from '@vismay/content-source/contentSource'
import { readComposeState } from '@vismay/content-source/composeState'

export interface SlotContextInput {
  slug: string
  /** The section being edited (indexes config.sections). Omit for surfaces with
   *  no unit in scope (e.g. a bare JSON editor) — context degrades to the story
   *  frame only. */
  parentIndex?: number
  subIndex?: number
  /** Slot identity — only lightly used (to decide how hard to surface charts). */
  kind?: string
  layerType?: string
  /** The chart being edited, when the slot is a specific chart's data. Spotlights
   *  that chart's requirement + current data so the edit stays grounded. */
  chartId?: string
}

/** Hard caps so the context block can never blow the prompt window. */
const MAX_PROSE_CHARS = 1200
const MAX_FACTS = 8
const MAX_FACT_CHARS = 200
const MAX_CHART_DATA_CHARS = 600
const MAX_TOTAL_CHARS = 4000

/**
 * Assemble the context block for a canvas AI call. Returns null when nothing
 * useful could be loaded (unknown story, no DB) so callers fall through to the
 * bare prompt.
 */
export async function buildSlotContext(
  input: SlotContextInput,
): Promise<string | null> {
  const { slug } = input
  const hasCoords =
    Number.isInteger(input.parentIndex) && (input.parentIndex as number) >= 0

  // All three loads are independent + best-effort. getStoryContent must allow
  // drafts — compose stories are status:'draft' and would otherwise throw.
  const [story, config, compose] = await Promise.all([
    getStoryContent(slug, { allowDraft: true }).catch(() => null),
    loadStoryConfig(slug).catch(() => null),
    readComposeState(slug).catch(() => null),
  ])

  if (!story && !config) return null

  const blocks: string[] = []

  /* ── Story frame ────────────────────────────────────────────────── */
  const fm = (story?.frontmatter ?? {}) as Record<string, unknown>
  const storyLines: string[] = []
  const title = str(fm.title)
  const subtitle = str(fm.subtitle)
  const format = str(fm.format) ?? str(compose?.format) ?? 'deck'
  if (title) {
    storyLines.push(
      `STORY: ${title}${subtitle ? ` — ${subtitle}` : ''}  (format: ${format})`,
    )
  }
  const palette = themeTokens(fm.theme)
  if (palette) storyLines.push(`Palette tokens: ${palette}`)

  // Section arc — every section heading, current one bracketed.
  const arc = sectionArc(config, hasCoords ? (input.parentIndex as number) : -1)
  if (arc) storyLines.push(`Section arc: ${arc}`)

  // Real chart ids the story already defines (so edits never invent one).
  const chartIds = collectChartIds(config)
  const chartReqs = chartRequirements(compose)
  if (chartIds.length) {
    storyLines.push(
      `Real chart ids: ${chartIds
        .map((id) => (chartReqs[id] ? `${id} (${chartReqs[id]})` : id))
        .join(', ')}`,
    )
  }
  if (storyLines.length) blocks.push(storyLines.join('\n'))

  /* ── Focus chart (when a specific chart's data is being edited) ──── */
  if (input.chartId) {
    const focus = await describeCharts(slug, [input.chartId], chartReqs)
    if (focus) blocks.push(focus.replace(/^CHART DATA\n/, 'CHART BEING EDITED\n'))
  }

  /* ── Section frame ──────────────────────────────────────────────── */
  if (hasCoords && story && config) {
    const unit = findUnit(
      slug,
      story.sections,
      config,
      input.parentIndex as number,
      input.subIndex,
    )
    if (unit) {
      const secLines: string[] = []
      const pc = unit.parentConfig as Record<string, unknown>
      const heading = str(unit.heading) ?? str(pc.heading)
      const kind = str(pc.kind) ?? 'text'
      secLines.push(`THIS SECTION — "${heading ?? '(untitled)'}" (kind: ${kind})`)

      const prose = (unit.paragraphs ?? []).join('\n').trim()
      if (prose) secLines.push(`Prose:\n${clip(prose, MAX_PROSE_CHARS)}`)

      const siblings = describeSiblingLayers(pc)
      if (siblings) secLines.push(`Layers in this section: ${siblings}`)

      blocks.push(secLines.join('\n'))

      // Chart data for charts this section features — the grounded numbers.
      const sectionChartIds = chartIds.length
        ? collectChartIds({ sections: [pc] } as never)
        : []
      const chartBlock = await describeCharts(slug, sectionChartIds, chartReqs)
      if (chartBlock) blocks.push(chartBlock)
    }
  }

  /* ── Grounded facts (research brief) ────────────────────────────── */
  const factsBlock = briefFacts(compose)
  if (factsBlock) blocks.push(factsBlock)

  if (!blocks.length) return null

  const header =
    'CONTEXT — the story this edit belongs to. Use it to stay consistent ' +
    '(real chart ids, palette tokens, the facts already established); do not ' +
    'contradict it or invent data not present here.'
  return clip([header, ...blocks].join('\n\n'), MAX_TOTAL_CHARS)
}

/* ─── Story-frame helpers ─────────────────────────────────────────── */

/** "accent #4a9fd8, accent2 #d8804a, teal #3fb8a0" from frontmatter.theme. */
function themeTokens(theme: unknown): string | null {
  if (!theme || typeof theme !== 'object') return null
  const colors = (theme as { colors?: unknown }).colors
  if (!colors || typeof colors !== 'object') return null
  const entries = Object.entries(colors as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => `${k} ${v as string}`)
  return entries.length ? entries.join(', ') : null
}

/** "Cover · Launch · [Revenue] · Backlog" — current section bracketed. */
function sectionArc(config: unknown, currentIndex: number): string | null {
  const sections = sectionsOf(config)
  if (!sections.length) return null
  return sections
    .map((s, i) => {
      const h =
        str((s as Record<string, unknown>).heading) ??
        str((s as Record<string, unknown>).id) ??
        `§${i + 1}`
      return i === currentIndex ? `[${h}]` : h
    })
    .join(' · ')
}

/** Chart id → a short requirement/title hint, from the compose outline. */
function chartRequirements(
  compose: { storyOutline?: unknown } | null,
): Record<string, string> {
  const out: Record<string, string> = {}
  const outline = compose?.storyOutline as { charts?: unknown } | undefined
  const charts = Array.isArray(outline?.charts) ? outline!.charts : []
  for (const c of charts) {
    if (!c || typeof c !== 'object') continue
    const id = str((c as Record<string, unknown>).id)
    if (!id) continue
    const hint =
      str((c as Record<string, unknown>).requirement) ??
      str((c as Record<string, unknown>).title) ??
      str((c as Record<string, unknown>).chartType)
    if (hint) out[id] = clip(hint, 120)
  }
  return out
}

/* ─── Section-frame helpers ───────────────────────────────────────── */

function findUnit(
  slug: string,
  sections: Parameters<typeof resolveUnits>[1],
  config: Parameters<typeof resolveUnits>[2],
  parentIndex: number,
  subIndex: number | undefined,
) {
  try {
    const { units } = resolveUnits(slug, sections, config)
    const sub = Number.isInteger(subIndex) ? (subIndex as number) : 0
    return (
      units.find((u) => u.parentIndex === parentIndex && u.subIndex === sub) ??
      units.find((u) => u.parentIndex === parentIndex) ??
      null
    )
  } catch {
    return null
  }
}

/** "bigStat($18.7B), chart(revenue-growth), bodyText" — the section's layers. */
function describeSiblingLayers(section: Record<string, unknown>): string | null {
  const layers: string[] = []
  for (const layer of allLayers(section)) {
    const t = str(layer.type)
    if (!t) {
      // A `{ chart: id }` shorthand with no explicit type.
      const chart = str(layer.chart)
      if (chart) layers.push(`chart(${chart})`)
      continue
    }
    const hint =
      t === 'chart'
        ? str(layer.id) ?? str(layer.chart)
        : str(layer.value) ?? str(layer.text) ?? str(layer.label)
    layers.push(hint ? `${t}(${clip(hint, 40)})` : t)
  }
  return layers.length ? layers.join(', ') : null
}

/** Every layer mapping under a section's foreground + background, flattened. */
function allLayers(section: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const push = (v: unknown) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) {
      for (const x of v) push(x)
      return
    }
    const obj = v as Record<string, unknown>
    if ('regions' in obj && obj.regions && typeof obj.regions === 'object') {
      for (const region of Object.values(obj.regions as Record<string, unknown>))
        push(region)
      return
    }
    out.push(obj)
  }
  push(section.foreground)
  push(section.background)
  return out
}

/** readChart for each id, summarised compactly. Best-effort + capped. */
async function describeCharts(
  slug: string,
  ids: string[],
  reqs: Record<string, string>,
): Promise<string | null> {
  const unique = [...new Set(ids)].slice(0, 3)
  if (!unique.length) return null
  const cs = getContentSource()
  const lines: string[] = []
  for (const id of unique) {
    const data = await cs.readChart(slug, id).catch(() => null)
    const req = reqs[id]
    if (data) {
      lines.push(`- ${id}${req ? ` (${req})` : ''}: ${clip(compact(data), MAX_CHART_DATA_CHARS)}`)
    } else if (req) {
      lines.push(`- ${id}: ${req} (no data generated yet)`)
    }
  }
  return lines.length ? `CHART DATA\n${lines.join('\n')}` : null
}

/* ─── Brief helpers ───────────────────────────────────────────────── */

function briefFacts(compose: { brief?: unknown } | null): string | null {
  const brief = compose?.brief
  if (!brief || typeof brief !== 'object') return null
  const b = brief as Record<string, unknown>
  const lines: string[] = []
  const summary = str(b.summary)
  if (summary) lines.push(`Summary: ${clip(summary, 300)}`)
  const facts = Array.isArray(b.keyFacts) ? b.keyFacts : []
  const factLines = facts
    .filter((f): f is string => typeof f === 'string')
    .slice(0, MAX_FACTS)
    .map((f) => `- ${clip(f, MAX_FACT_CHARS)}`)
  if (factLines.length) lines.push(`Key facts:\n${factLines.join('\n')}`)
  const entities = Array.isArray(b.entities)
    ? b.entities.filter((e): e is string => typeof e === 'string')
    : []
  if (entities.length) lines.push(`Entities: ${entities.slice(0, 12).join(', ')}`)
  return lines.length ? `GROUNDED FACTS (from research)\n${lines.join('\n')}` : null
}

/* ─── Shared helpers ──────────────────────────────────────────────── */

function sectionsOf(config: unknown): unknown[] {
  if (!config || typeof config !== 'object') return []
  const s = (config as { sections?: unknown }).sections
  return Array.isArray(s) ? s : []
}

/** Walk a config (or single-section wrapper) collecting every chart id, from
 *  both `{ type: chart, id }` layers and the `{ chart: id }` shorthand. */
function collectChartIds(config: unknown): string[] {
  const ids = new Set<string>()
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const x of node) walk(x)
      return
    }
    const obj = node as Record<string, unknown>
    if (obj.type === 'chart' && typeof obj.id === 'string') ids.add(obj.id)
    if (typeof obj.chart === 'string') ids.add(obj.chart)
    for (const v of Object.values(obj)) walk(v)
  }
  walk(config)
  return [...ids]
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Compact JSON for an unknown value (chart data), whitespace-stripped. */
function compact(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
