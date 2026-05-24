import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import type { ResolvedUnit } from '@vismay/viz-engine'
import { parseMapOverrides } from '@vismay/viz-engine'
import { parseTtsConfig, findTtsOverride } from '@vismay/content-source/storyTts'
import type { InputNodeData } from './InputNode'

/**
 * Raw text bundle loaded once on the server. The builder slices the relevant
 * per-section/per-unit fragment from each source when it builds the input
 * nodes for a given frame.
 *
 * Yamls stay as raw strings (not pre-parsed) so future editing can preserve
 * formatting / comments; the builder parses lazily via the `parsed` accessor.
 */
export interface CanvasSources {
  shareYaml: string | null
  reportYaml: string | null
  mapYaml: string | null
  ttsYaml: string | null
}

/** Lazy-parsed view of `CanvasSources`. Caller is expected to memoise the
 *  bundle so the same parsed objects are reused across frames. */
export interface ParsedCanvasSources {
  share: unknown
  report: unknown
  mapOverrides: ReturnType<typeof parseMapOverrides>
  tts: ReturnType<typeof parseTtsConfig>
}

export function parseCanvasSources(sources: CanvasSources): ParsedCanvasSources {
  return {
    share: safeParseYaml(sources.shareYaml),
    report: safeParseYaml(sources.reportYaml),
    mapOverrides: parseMapOverrides(sources.mapYaml),
    tts: parseTtsConfig(sources.ttsYaml),
  }
}

function safeParseYaml(raw: string | null): unknown {
  if (!raw || !raw.trim()) return null
  try {
    return parseYaml(raw)
  } catch {
    return null
  }
}

/**
 * Derive the input subgraph for a section frame. Every section gets the same
 * fixed slot set so the diagram shape stays consistent across sections;
 * slots without data for this particular section render a muted "no override"
 * placeholder so the empty state is unmistakable.
 *
 * Frame inputs decompose the section config into the slot tree authors
 * actually think in:
 *   - Content    → markdown anchored to the section
 *   - Layout     → the foreground layout name (only when foreground is
 *                  regions-shaped — flat layer stacks have no layout)
 *   - Background → the section's background layer stack (under "Viz")
 *   - Lead/Charts/Body → individual foreground regions (under
 *                  "Viz → Foreground"), only meaningful when foreground is
 *                  regions-shaped.
 *
 * The remaining four slots are PER-FRAME OVERRIDES sourced from file-level
 * data sliced by `(parentIndex, subIndex)` (and `sliceIndex` for narration).
 * They're returned by this same helper for any caller that wants the full
 * input set, but the canvas builds them only inside per-output override
 * columns; the frame's left input column shows just the slot tree above.
 */
export function buildInputsForUnit(
  unit: ResolvedUnit,
  parsed: ParsedCanvasSources
): InputNodeData[] {
  return [
    contentNode(unit),
    layoutNode(unit),
    backgroundNode(unit),
    leadNode(unit),
    chartsNode(unit),
    bodyNode(unit),
    shareNode(unit, parsed),
    reportNode(unit, parsed),
    mapOverrideNode(unit, parsed),
    narrationNode(unit, parsed),
  ]
}

/* ─── Individual input builders ───────────────────────────────────────
 * Exported separately so the per-output override columns (right side of
 * the canvas, attached to each expanded output node) can reuse the same
 * slicing without duplicating the YAML extraction logic.
 */

export function contentNode(unit: ResolvedUnit): InputNodeData {
  const body =
    unit.paragraphs.length > 0
      ? truncateLines(unit.paragraphs.join('\n\n'), 8)
      : '(no markdown anchored)'
  return {
    id: 'content',
    label: 'Content',
    tag: 'MARKDOWN',
    body,
    variant: 'mono',
  }
}

/* ── Layout / Viz / Foreground slot tree ───────────────────────────── */

/** Region-shaped foreground: `{ layout: string, regions: { … } }`. The
 *  alternative is a flat `VizLayer | VizLayer[]` with no layout/regions. */
interface ForegroundRegionsShape {
  layout: string
  regions: Record<string, unknown>
}
function asForegroundRegions(
  foreground: unknown
): ForegroundRegionsShape | null {
  if (
    foreground &&
    typeof foreground === 'object' &&
    !Array.isArray(foreground) &&
    typeof (foreground as { layout?: unknown }).layout === 'string' &&
    typeof (foreground as { regions?: unknown }).regions === 'object' &&
    (foreground as { regions?: unknown }).regions !== null
  ) {
    return foreground as ForegroundRegionsShape
  }
  return null
}

export function layoutNode(unit: ResolvedUnit): InputNodeData {
  const regions = asForegroundRegions(unit.parentConfig.foreground)
  if (!regions) {
    return {
      id: 'layout',
      label: 'Layout',
      tag: '—',
      body: '(foreground has no layout — flat layer stack)',
      variant: 'muted',
    }
  }
  return {
    id: 'layout',
    label: 'Layout',
    tag: 'NAME',
    body: regions.layout,
    variant: 'mono',
  }
}

export function backgroundNode(unit: ResolvedUnit): InputNodeData {
  const bg = unit.parentConfig.background
  if (bg === undefined) {
    return {
      id: 'background',
      label: 'Background',
      tag: '—',
      body: '(no background — inherits from legacy map field)',
      variant: 'muted',
    }
  }
  return {
    id: 'background',
    label: 'Background',
    tag: 'YAML',
    body: truncateLines(safeYamlStringify(bg), 10),
    variant: 'mono',
  }
}

/** Build a foreground-region slot. Pulls `foreground.regions[regionKey]`
 *  when the section uses a regions-shaped foreground; otherwise muted. */
function foregroundRegionNode(
  unit: ResolvedUnit,
  regionKey: string,
  id: string,
  label: string
): InputNodeData {
  const regions = asForegroundRegions(unit.parentConfig.foreground)
  if (!regions) {
    return {
      id,
      label,
      tag: '—',
      body: '(foreground is a flat layer stack — no regions)',
      variant: 'muted',
    }
  }
  const slice = regions.regions[regionKey]
  if (slice === undefined) {
    return {
      id,
      label,
      tag: '—',
      body: `(no ${regionKey} region in this layout)`,
      variant: 'muted',
    }
  }
  return {
    id,
    label,
    tag: 'YAML',
    body: truncateLines(safeYamlStringify(slice), 10),
    variant: 'mono',
  }
}

export function leadNode(unit: ResolvedUnit): InputNodeData {
  return foregroundRegionNode(unit, 'lead', 'lead', 'Lead')
}

export function chartsNode(unit: ResolvedUnit): InputNodeData {
  return foregroundRegionNode(unit, 'charts', 'charts', 'Charts')
}

export function bodyNode(unit: ResolvedUnit): InputNodeData {
  return foregroundRegionNode(unit, 'body', 'body', 'Body')
}

export function shareNode(
  unit: ResolvedUnit,
  parsed: ParsedCanvasSources
): InputNodeData {
  const sectionId =
    unit.parentConfig.id ?? `section-${unit.parentIndex}`
  const slice = sliceShareForSection(parsed.share, sectionId)
  return {
    id: 'share',
    label: 'Share Variants',
    tag: slice ? 'YAML' : '—',
    body:
      slice === null
        ? '(no override for this section)'
        : truncateLines(safeYamlStringify(slice), 12),
    variant: slice ? 'mono' : 'muted',
  }
}

export function reportNode(
  unit: ResolvedUnit,
  parsed: ParsedCanvasSources
): InputNodeData {
  const slice = sliceReportForUnit(
    parsed.report,
    unit.parentIndex,
    unit.subIndex
  )
  return {
    id: 'report',
    label: 'Report Override',
    tag: slice ? 'YAML' : '—',
    body:
      slice === null
        ? '(no override for this section)'
        : truncateLines(safeYamlStringify(slice), 12),
    variant: slice ? 'mono' : 'muted',
  }
}

/**
 * Variant of <reportNode> scoped to a single output format. The right-side
 * per-output input column attaches one of these (rather than the combined
 * report+slides node) so the Report output shows its `report` slice and
 * the Slides output shows its `slides` slice — visually disaggregated to
 * match what each output actually consumes.
 */
export function reportNodeFormat(
  unit: ResolvedUnit,
  parsed: ParsedCanvasSources,
  format: 'report' | 'slides'
): InputNodeData {
  const slice = sliceReportForUnit(
    parsed.report,
    unit.parentIndex,
    unit.subIndex
  )
  let formatted: unknown | null = null
  if (slice && typeof slice === 'object') {
    formatted = (slice as Record<string, unknown>)[format] ?? null
  }
  return {
    id: `report-${format}`,
    label: format === 'report' ? 'Report Override' : 'Slides Override',
    tag: formatted ? 'YAML' : '—',
    body:
      formatted == null
        ? '(no override for this section)'
        : truncateLines(safeYamlStringify(formatted), 12),
    variant: formatted ? 'mono' : 'muted',
  }
}

export function mapOverrideNode(
  unit: ResolvedUnit,
  parsed: ParsedCanvasSources
): InputNodeData {
  const slice = sliceMapForUnit(
    parsed.mapOverrides,
    unit.parentIndex,
    unit.subIndex
  )
  return {
    id: 'map-override',
    label: 'Map Override',
    tag: slice ? 'YAML' : '—',
    body:
      slice === null
        ? '(no override for this section)'
        : truncateLines(safeYamlStringify(slice), 12),
    variant: slice ? 'mono' : 'muted',
  }
}

export function narrationNode(
  unit: ResolvedUnit,
  parsed: ParsedCanvasSources
): InputNodeData {
  const tts = findTtsOverride(
    parsed.tts,
    unit.parentIndex,
    unit.subIndex,
    unit.sliceIndex ?? 0
  )
  return {
    id: 'narration',
    label: 'Narration',
    tag: tts ? 'TEXT' : '—',
    body: tts ? truncateLines(tts.script, 10) : '(no override for this section)',
    variant: tts ? 'mono' : 'muted',
  }
}

/**
 * Per-output override inputs: which input nodes feed a given output.
 *
 * The frame-level input column (left of the section frame) shows the
 * full source data — every override the section can have. Each expanded
 * output on the right then shows just the override(s) it actually
 * consumes, attached to that output's left edge:
 *   share-*    → Share Variants slice
 *   slides     → report.yaml slides slice
 *   report     → report.yaml report slice
 *   autoplay-* → Map Override + Narration
 *
 * Reuses the same slicers as the frame-level column so the per-output
 * cards always agree with the frame-level cards. Node ids are namespaced
 * with the output id so React keys stay unique when multiple outputs
 * share an override (e.g. both autoplay nodes have a Map Override card).
 */
export function buildOverridesForOutput(
  outputId: string,
  outputGroup: string,
  unit: ResolvedUnit,
  parsed: ParsedCanvasSources
): InputNodeData[] {
  const nodes: InputNodeData[] = []
  switch (outputGroup) {
    case 'share':
      nodes.push(shareNode(unit, parsed))
      break
    case 'slides':
      nodes.push(reportNodeFormat(unit, parsed, 'slides'))
      break
    case 'report':
      nodes.push(reportNodeFormat(unit, parsed, 'report'))
      break
    case 'autoplay':
      nodes.push(mapOverrideNode(unit, parsed))
      nodes.push(narrationNode(unit, parsed))
      break
  }
  return nodes.map((n) => ({ ...n, id: `${outputId}:${n.id}` }))
}

/* ─── Slicers ──────────────────────────────────────────────────────── */

function sliceShareForSection(
  share: unknown,
  sectionId: string
): unknown | null {
  if (!share || typeof share !== 'object') return null
  const sections = (share as { sections?: Record<string, unknown> }).sections
  if (!sections || typeof sections !== 'object') return null
  const slice = sections[sectionId]
  return slice == null ? null : slice
}

interface ReportPageEntry {
  unit?: { parentIndex?: number; subIndex?: number }
  [k: string]: unknown
}

function sliceReportForUnit(
  reportDoc: unknown,
  parentIndex: number,
  subIndex: number
): unknown | null {
  if (!reportDoc || typeof reportDoc !== 'object') return null
  const doc = reportDoc as {
    report?: { pages?: ReportPageEntry[] }
    slides?: { pages?: ReportPageEntry[] }
    pages?: ReportPageEntry[]
  }

  const matches = (p: ReportPageEntry) =>
    p.unit?.parentIndex === parentIndex && p.unit?.subIndex === subIndex

  const reportPage = doc.report?.pages?.find(matches)
  const slidesPage = doc.slides?.pages?.find(matches)
  // Legacy flat shape: a top-level `pages:` applies to both formats.
  const legacyPage = doc.pages?.find(matches)

  const out: Record<string, unknown> = {}
  if (reportPage) out.report = reportPage
  if (slidesPage) out.slides = slidesPage
  if (legacyPage && !reportPage && !slidesPage) out.pages = legacyPage

  return Object.keys(out).length === 0 ? null : out
}

function sliceMapForUnit(
  mapOverrides: ReturnType<typeof parseMapOverrides>,
  parentIndex: number,
  subIndex: number
): unknown | null {
  if (!mapOverrides) return null
  // Match per-(parentIndex, subIndex). subIndex=0 also matches the parent-
  // level entry (subIndex undefined) so the user can see they're inheriting
  // the parent override on subsection 0.
  const entry = mapOverrides.overrides.find(
    (e) =>
      e.parentIndex === parentIndex &&
      (e.subIndex === subIndex || (e.subIndex === undefined && subIndex === 0))
  )
  return entry ? { target: { parentIndex: entry.parentIndex, subIndex: entry.subIndex }, map: entry.map } : null
}

/* ─── Formatters ──────────────────────────────────────────────────── */

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  return lines.slice(0, maxLines).join('\n') + '\n…'
}

function safeYamlStringify(value: unknown): string {
  try {
    return yamlStringify(value, { lineWidth: 60 })
  } catch {
    return '(failed to stringify YAML)'
  }
}
