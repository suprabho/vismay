import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import type { ResolvedUnit, VizLayer, Theme } from '@vismay/viz-engine'
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

/* ─── Individual input builders ───────────────────────────────────────
 * The frame's left column is a dependency graph: source-file leaves feed
 * region/group nodes that funnel into the frame (see `buildInputGraph`).
 * The override builders (`shareNode` etc.) are reused by the per-output
 * override columns on the right side of the canvas.
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

/* ── Foreground layout helpers ─────────────────────────────────────── */

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

/* ── Theme ─────────────────────────────────────────────────────────── */

/** Story-wide theme (colors + fonts). Constant across sections — surfaced
 *  as a direct frame input, like Layout. */
export function themeNode(theme: Theme | null): InputNodeData {
  if (!theme) {
    return {
      id: 'theme',
      label: 'Theme',
      tag: '—',
      body: '(no theme on this story)',
      variant: 'muted',
    }
  }
  return {
    id: 'theme',
    label: 'Theme',
    tag: 'THEME',
    body: truncateLines(
      safeYamlStringify({ colors: theme.colors, fonts: theme.fonts }),
      12
    ),
    variant: 'mono',
  }
}

/* ── Layer-tier dependency graph ───────────────────────────────────────
 * The sketch's lineage: raw source layers (map / chart / image / text) feed
 * region nodes (Charts / Body / …), which fan into Foreground / Background,
 * which feed the frame. Each VizLayer becomes a leaf; each region and each
 * group becomes a junction. All sourced from `unit.parentConfig` — no extra
 * server loading.
 */

export interface RegionGraphNode {
  key: string
  label: string
  /** Source-layer leaves composing this region (may be empty). */
  layers: InputNodeData[]
}

export interface ForegroundGraph {
  /** 'regions' = named layout regions; 'flat' = bare layer stack; 'none'. */
  shape: 'regions' | 'flat' | 'none'
  layout: string | null
  /** Populated when shape === 'regions'. */
  regions: RegionGraphNode[]
  /** Populated when shape === 'flat'. */
  layers: InputNodeData[]
}

export interface BackgroundGraph {
  shape: 'layers' | 'none'
  layers: InputNodeData[]
}

export interface InputGraph {
  /** Section markdown (prose) — direct frame input. */
  content: InputNodeData
  /** Foreground layout name — direct frame input. */
  layout: InputNodeData
  /** Story theme — direct frame input. */
  theme: InputNodeData
  background: BackgroundGraph
  foreground: ForegroundGraph
}

/** Friendly node label for a VizLayer `type`. Falls back to the raw type
 *  for vertical-specific modules (e.g. `fs:standings-table`). */
function layerLabel(type: string): string {
  switch (type) {
    case 'map':
      return 'Map'
    case 'image':
      return 'Image'
    case 'chart':
      return 'Chart'
    case 'text':
      return 'Text'
    case 'markdown':
      return 'Markdown'
    case 'embed':
      return 'Embed'
    case 'video':
      return 'Video'
    case 'rive':
      return 'Rive'
    default:
      return type
  }
}

function layerLeaf(layer: VizLayer, idPrefix: string, i: number): InputNodeData {
  const type =
    layer && typeof layer.type === 'string' ? layer.type : 'layer'
  return {
    id: `${idPrefix}:${i}`,
    label: layerLabel(type),
    tag: type.toUpperCase(),
    body: truncateLines(safeYamlStringify(layer), 10),
    variant: 'mono',
  }
}

/** Coerce a slot value (single layer | array | undefined) to a layer array. */
function asLayerArray(value: unknown): VizLayer[] {
  if (Array.isArray(value)) return value as VizLayer[]
  if (value && typeof value === 'object') return [value as VizLayer]
  return []
}

function titleCase(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1)
}

export function buildBackgroundGraph(unit: ResolvedUnit): BackgroundGraph {
  const bg = unit.parentConfig.background
  // Explicit opt-out (`background: { type: none }`).
  if (
    bg &&
    typeof bg === 'object' &&
    (bg as { type?: unknown }).type === 'none'
  ) {
    return { shape: 'none', layers: [] }
  }
  // Modern layer stack.
  if (bg !== undefined) {
    const layers = asLayerArray(bg).map((l, i) => layerLeaf(l, 'bg', i))
    return layers.length
      ? { shape: 'layers', layers }
      : { shape: 'none', layers: [] }
  }
  // Legacy: no `background`, but a bare `map:` synthesizes one map layer at
  // runtime. Surface it as a single synthetic Map leaf so the lineage still
  // traces back to a source.
  const legacyMap = unit.parentConfig.map
  if (legacyMap) {
    return {
      shape: 'layers',
      layers: [
        {
          id: 'bg:0',
          label: 'Map',
          tag: 'MAP · LEGACY',
          body: truncateLines(safeYamlStringify(legacyMap), 10),
          variant: 'mono',
        },
      ],
    }
  }
  return { shape: 'none', layers: [] }
}

export function buildForegroundGraph(unit: ResolvedUnit): ForegroundGraph {
  const fg = unit.parentConfig.foreground
  const regionsShape = asForegroundRegions(fg)
  if (regionsShape) {
    const regions: RegionGraphNode[] = Object.entries(
      regionsShape.regions
    ).map(([key, value]) => ({
      key,
      label: titleCase(key),
      layers: asLayerArray(value).map((l, i) => layerLeaf(l, `fg:${key}`, i)),
    }))
    return { shape: 'regions', layout: regionsShape.layout, regions, layers: [] }
  }
  const layers = asLayerArray(fg).map((l, i) => layerLeaf(l, 'fg', i))
  if (layers.length === 0) {
    return { shape: 'none', layout: null, regions: [], layers: [] }
  }
  return { shape: 'flat', layout: null, regions: [], layers }
}

/** Whole input subgraph for one section frame. */
export function buildInputGraph(
  unit: ResolvedUnit,
  theme: Theme | null
): InputGraph {
  return {
    content: contentNode(unit),
    layout: layoutNode(unit),
    theme: themeNode(theme),
    background: buildBackgroundGraph(unit),
    foreground: buildForegroundGraph(unit),
  }
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

/**
 * Report override scoped to a single output format. The right-side
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
