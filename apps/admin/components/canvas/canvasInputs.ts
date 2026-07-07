import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import type {
  ResolvedUnit,
  StorySectionConfig,
  VizLayer,
  Theme,
} from '@vismay/viz-engine'
import { parseMapOverrides } from '@vismay/viz-engine'
import { parseTtsConfig, findTtsOverride } from '@vismay/content-source/storyTts'
import type { InputNodeData } from './InputNode'
import type { SlotPath } from './canvasSlotEditing'

/**
 * Raw text bundle loaded once on the server. The builder slices the relevant
 * per-section/per-unit fragment from each source when it builds the input
 * nodes for a given frame.
 *
 * Yamls stay as raw strings (not pre-parsed) so future editing can preserve
 * formatting / comments; the builder parses lazily via the `parsed` accessor.
 *
 * `configYaml` and `markdown` carry the story's primary config + body so the
 * frame-level input nodes (Content / Layout / Background / Lead / Charts /
 * Body) can be click-to-edit too — they all live in those two files, not in
 * the per-output override files.
 */
export interface CanvasSources {
  shareYaml: string | null
  reportYaml: string | null
  mapYaml: string | null
  ttsYaml: string | null
  configYaml: string | null
  markdown: string | null
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

/**
 * Refresh `unit.parentConfig` from the latest configYaml. The frame input
 * builders (layoutNode, backgroundNode, leadNode, …) read from
 * `parentConfig.foreground` / `parentConfig.background` — which the page
 * captures at SSR load and doesn't re-resolve client-side. After an
 * in-canvas save those fields change on disk and in `CanvasSources`, but
 * the original unit still carries the pre-save shape, so the preview
 * cards would lag the iframe by one section switch.
 *
 * This helper layers the live config over the original unit, keeping
 * fields the live config doesn't own (heading, paragraphs, sliceIndex,
 * etc.). Falls through to the original unit when configYaml is missing
 * or malformed — server-side load already happened, so any state where
 * configYaml is broken would be transient.
 */
export function liveUnit(
  unit: ResolvedUnit,
  configYaml: string | null
): ResolvedUnit {
  if (!configYaml) return unit
  try {
    // JSON-native configs (new verticals) must be read with `JSON.parse`, the
    // SAME way `loadStoryConfig` parses them server-side — the renderer that
    // feeds the centre Frame uses that path. `parseYaml` is a YAML-1.2 superset
    // and *usually* round-trips JSON, but the two parsers are not identical, and
    // any divergence here desyncs the left-column input nodes (Layout /
    // Foreground) from the rendered slide. Parse JSON natively, fall back to
    // YAML for legacy configs (where `JSON.parse` throws on the first token).
    const doc = parseConfigDoc(configYaml) as { sections?: unknown[] } | null
    const section = doc?.sections?.[unit.parentIndex]
    if (!section || typeof section !== 'object') return unit
    return { ...unit, parentConfig: section as StorySectionConfig }
  } catch {
    return unit
  }
}

/** Parse a story config string the same way `loadStoryConfig` does: JSON-native
 *  via `JSON.parse`, legacy YAML via `parseYaml`. JSON is the strict subset, so
 *  trying it first keeps JSON configs byte-identical to the server's view and
 *  only falls through to YAML when the text isn't JSON. */
function parseConfigDoc(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return parseYaml(text)
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

/**
 * Section markdown preview. `maxLines` defaults to the compact 8-line
 * excerpt the override cards use; the frame's collapsible Content leaf
 * passes a much higher budget (the node body scrolls internally there,
 * so the clip is only a guard against pathological section sizes).
 */
export function contentNode(
  unit: ResolvedUnit,
  maxLines: number = 8
): InputNodeData {
  const body =
    unit.paragraphs.length > 0
      ? truncateLines(unit.paragraphs.join('\n\n'), maxLines)
      : '(no markdown anchored)'
  return {
    id: 'content',
    label: 'Content',
    tag: 'MARKDOWN',
    body,
    variant: 'mono',
  }
}

/**
 * Deck cover editorial text: the `eyebrow` / `heading` / `dek` / `byline`
 * fields the full-bleed cover paints over its hero image. These live at the
 * section root in config.yaml (not the markdown body), so for a `kind: cover`
 * section this node REPLACES the markdown Content leaf — clicking it opens the
 * `cover` editor slice (see canvasEditing). Shown in top-to-bottom cover order;
 * `heading` falls back to the resolved unit heading so the title always shows.
 */
export function coverNode(unit: ResolvedUnit): InputNodeData {
  const cfg = unit.parentConfig as unknown as {
    eyebrow?: unknown
    heading?: unknown
    dek?: unknown
    byline?: unknown
  }
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
  const fields: Record<string, string> = {}
  if (str(cfg.eyebrow)) fields.eyebrow = str(cfg.eyebrow)
  const heading = str(cfg.heading) || (unit.heading ?? '').trim()
  if (heading) fields.heading = heading
  if (str(cfg.dek)) fields.dek = str(cfg.dek)
  if (str(cfg.byline)) fields.byline = str(cfg.byline)
  const has = Object.keys(fields).length > 0
  return {
    id: 'cover',
    label: 'Cover',
    tag: has ? 'COVER' : '—',
    body: has
      ? truncateLines(safeYamlStringify(fields), 12)
      : '(no cover text yet — click to add eyebrow / heading / dek)',
    variant: has ? 'mono' : 'muted',
  }
}

/* ── Foreground layout helpers ─────────────────────────────────────── */

/** Region-shaped foreground: `{ regions: { … } }`, optionally with a `layout`
 *  name. The alternative is a flat `VizLayer | VizLayer[]`.
 *
 *  `layout` is OPTIONAL here on purpose — it mirrors the engine's
 *  `isRegionsInput` (`viz-engine/src/lib/resolveSlots.ts`), which discriminates
 *  on `regions` alone: the inline-region form omits `layout`, and the deck
 *  format can carry the name at the section root (`section.layout`) instead.
 *  Requiring `layout` here made the canvas mis-read those slides as a flat
 *  stack while the renderer drew the regions — so Layout / Foreground went
 *  blank on a slide that clearly had both. */
interface ForegroundRegionsShape {
  layout?: string
  regions: Record<string, unknown>
}
function asForegroundRegions(
  foreground: unknown
): ForegroundRegionsShape | null {
  if (
    foreground &&
    typeof foreground === 'object' &&
    !Array.isArray(foreground) &&
    // A `map` VizLayer also carries a `regions` field — exclude anything that
    // looks like a layer (`type`), exactly as `isRegionsInput` does.
    !('type' in (foreground as object)) &&
    typeof (foreground as { regions?: unknown }).regions === 'object' &&
    (foreground as { regions?: unknown }).regions !== null
  ) {
    return foreground as ForegroundRegionsShape
  }
  return null
}

/** The layout name for a region-shaped foreground: the inner `foreground.layout`
 *  wins, else the section-root `layout` sugar the deck format uses. */
function foregroundLayoutName(
  unit: ResolvedUnit,
  regions: ForegroundRegionsShape
): string | null {
  if (regions.layout && regions.layout.trim()) return regions.layout
  const rootLayout = (unit.parentConfig as { layout?: unknown }).layout
  return typeof rootLayout === 'string' && rootLayout.trim() ? rootLayout : null
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
  const name = foregroundLayoutName(unit, regions)
  return {
    id: 'layout',
    label: 'Layout',
    tag: name ? 'NAME' : '—',
    // Region-shaped but unnamed: the renderer falls back to the default layout.
    // Surface that rather than the misleading "flat layer stack" copy.
    body: name ?? '(regions — no named layout)',
    variant: name ? 'mono' : 'muted',
  }
}

/* ── Theme ─────────────────────────────────────────────────────────── */

/** Story-wide theme (colors + fonts). Constant across sections — surfaced
 *  as a direct frame input, like Layout. Clickable: opens ThemeEditor. */
export function themeNode(theme: Theme | null): InputNodeData {
  if (!theme) {
    return {
      id: 'theme',
      label: 'Theme',
      tag: '—',
      body: '(no theme on this story — click to add)',
      variant: 'muted',
      slot: { kind: 'theme' },
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
    slot: { kind: 'theme' },
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
    case 'bigStat':
      return 'Big stat'
    case 'bodyText':
      return 'Body text'
    case 'quote':
      return 'Quote'
    case 'keyValue':
      return 'Key/value list'
    case 'table':
      return 'Table'
    case 'imageGrid':
      return 'Image grid'
    default:
      return type
  }
}

function layerLeaf(
  layer: VizLayer,
  idPrefix: string,
  i: number,
  path: SlotPath
): InputNodeData {
  const type =
    layer && typeof layer.type === 'string' ? layer.type : 'layer'
  return {
    id: `${idPrefix}:${i}`,
    label: layerLabel(type),
    tag: type.toUpperCase(),
    body: truncateLines(safeYamlStringify(layer), 10),
    variant: 'mono',
    // Every layer leaf carries a slot descriptor so the canvas's click
    // handler can route it to the right editor. The dispatcher (CanvasClient)
    // decides which surface opens per `layerType`: map → YAML + MapPicker,
    // image → ImageEditModal, any module with an `adminForm` → SlotInspector,
    // and types with neither (chart, malformed/unknown) → the YAML editor.
    // Keeping the routing decision out of here lets canvasInputs stay
    // presentation-only.
    //
    // Chart layers carry their referenced `chartId` so `mountInputs` can hang a
    // dedicated Chart Data node off the leaf without re-parsing the config.
    slot:
      type === 'chart' && typeof (layer as { id?: unknown }).id === 'string'
        ? { kind: 'layer', layerType: type, path, chartId: (layer as { id?: string }).id }
        : { kind: 'layer', layerType: type, path },
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
    const layers = asLayerArray(bg).map((l, i) =>
      layerLeaf(l, 'bg', i, { kind: 'background', index: i })
    )
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
          slot: { kind: 'layer', layerType: 'map', path: { kind: 'legacyMap' } },
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
      layers: asLayerArray(value).map((l, i) =>
        layerLeaf(l, `fg:${key}`, i, {
          kind: 'foregroundRegion',
          region: key,
          index: i,
        })
      ),
    }))
    return {
      shape: 'regions',
      layout: foregroundLayoutName(unit, regionsShape),
      regions,
      layers: [],
    }
  }
  const layers = asLayerArray(fg).map((l, i) =>
    layerLeaf(l, 'fg', i, { kind: 'foregroundFlat', index: i })
  )
  if (layers.length === 0) {
    return { shape: 'none', layout: null, regions: [], layers: [] }
  }
  return { shape: 'flat', layout: null, regions: [], layers }
}

/** Line budget for the frame's Content leaf — effectively "the whole
 *  section body" for any sane section; the canvas renders it inside a
 *  max-height scroll container, so this is a guard, not a layout clamp. */
const CONTENT_LEAF_MAX_LINES = 240

/** Whole input subgraph for one section frame. */
export function buildInputGraph(
  unit: ResolvedUnit,
  theme: Theme | null
): InputGraph {
  return {
    content: contentNode(unit, CONTENT_LEAF_MAX_LINES),
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

/**
 * Per-section share-card map override (sliced from share.yaml's
 * `sections[<sectionId>].map` block). Separate from `mapOverrideNode` because
 * Share Cards read camera fields from share.yaml — the map.yaml overrides
 * only feed autoplay. Surfacing the right slice keeps the canvas honest:
 * what the user edits on the Share output is what the Share Cards actually
 * consume.
 */
export function shareMapOverrideNode(
  unit: ResolvedUnit,
  parsed: ParsedCanvasSources
): InputNodeData {
  const sectionId =
    unit.parentConfig.id ?? `section-${unit.parentIndex}`
  const slice = sliceShareMapForSection(parsed.share, sectionId)
  return {
    id: 'share-map-override',
    label: 'Map Override',
    tag: slice ? 'YAML' : '—',
    body:
      slice === null
        ? '(no share-map override for this section)'
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

/** Subset of `sliceShareForSection` that returns only the `.map` sub-block —
 *  the share-card camera override the canvas surfaces as its own card. */
function sliceShareMapForSection(
  share: unknown,
  sectionId: string
): unknown | null {
  const section = sliceShareForSection(share, sectionId)
  if (!section || typeof section !== 'object') return null
  const map = (section as { map?: unknown }).map
  return map == null ? null : map
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

/**
 * JSON sibling of `safeYamlStringify` for node bodies that show raw JSON
 * (the Chart Data card). Two guards `JSON.stringify` alone doesn't give:
 *   - it can THROW (circular refs, BigInt) — caught, fallback copy;
 *   - it can return `undefined` (bare undefined / function / symbol) —
 *     coerced, since a node body must always be a string.
 */
export function safeJsonStringify(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2)
    return typeof text === 'string' ? text : String(value)
  } catch {
    return '(failed to render JSON)'
  }
}
