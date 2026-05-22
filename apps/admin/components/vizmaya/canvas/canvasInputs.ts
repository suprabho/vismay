import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import type { ResolvedUnit } from '@vismay/viz-engine'
import { parseMapOverrides } from '@vismay/viz-engine'
import { parseTtsConfig, findTtsOverride } from '@vismay/content-source/storyTts'
import type { InputNodeData } from './InputNode'

/**
 * Raw text + chart JSON bundle loaded once on the server. The builder slices
 * the relevant per-section/per-unit fragment from each source when it builds
 * the input nodes for a given frame.
 *
 * Yamls stay as raw strings (not pre-parsed) so future editing can preserve
 * formatting / comments; the builder parses lazily via the `parsed` accessor.
 */
export interface CanvasSources {
  chartsById: Record<string, unknown>
  shareYaml: string | null
  reportYaml: string | null
  mapYaml: string | null
  ttsYaml: string | null
}

/** Lazy-parsed view of `CanvasSources`. Caller is expected to memoise the
 *  bundle so the same parsed objects are reused across frames. */
export interface ParsedCanvasSources {
  charts: Record<string, unknown>
  share: unknown
  report: unknown
  mapOverrides: ReturnType<typeof parseMapOverrides>
  tts: ReturnType<typeof parseTtsConfig>
}

export function parseCanvasSources(sources: CanvasSources): ParsedCanvasSources {
  return {
    charts: sources.chartsById,
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
 * seven input slots so the diagram shape stays consistent across sections;
 * slots without data for this particular section render a muted "no override"
 * placeholder so the empty state is unmistakable.
 *
 * Slots 4–7 are PER-FRAME OVERRIDES — file-level data carved into a slice
 * keyed by `(parentIndex, subIndex)` (and `sliceIndex` for narration).
 * Semantically each override feeds a specific output kind:
 *   - Share Variants  → Share cards
 *   - Report Override → Report PDF + Slides deck
 *   - Map Override    → Autoplay video
 *   - Narration       → Autoplay video (TTS track)
 * The diagram wires them all to the section frame uniformly; per-output
 * wiring is a follow-up.
 */
export function buildInputsForUnit(
  unit: ResolvedUnit,
  parsed: ParsedCanvasSources
): InputNodeData[] {
  const section = unit.parentConfig

  const contentBody =
    unit.paragraphs.length > 0
      ? truncateLines(unit.paragraphs.join('\n\n'), 8)
      : '(no markdown anchored)'

  let configBody: string
  try {
    configBody = truncateLines(yamlStringify(section, { lineWidth: 60 }), 10)
  } catch {
    configBody = '(failed to serialise config slice)'
  }

  // ── Chart Data ────────────────────────────────────────────────────
  const chartId = section.chart
  let chartBody: string
  let chartHasData = false
  if (!chartId) {
    chartBody = '(no chart in this section)'
  } else {
    const data = parsed.charts[chartId]
    if (data === undefined) {
      chartBody = `chart: ${chartId}\n\n(JSON not found)`
    } else {
      chartHasData = true
      chartBody = `// ${chartId}\n${truncateLines(safeJsonStringify(data), 12)}`
    }
  }

  // ── Share Variants ────────────────────────────────────────────────
  const sectionId = section.id ?? `section-${unit.parentIndex}`
  const shareSlice = sliceShareForSection(parsed.share, sectionId)
  const shareBody =
    shareSlice === null
      ? '(no override for this section)'
      : truncateLines(safeYamlStringify(shareSlice), 12)

  // ── Report Override (report + slides combined) ───────────────────
  const reportSlice = sliceReportForUnit(
    parsed.report,
    unit.parentIndex,
    unit.subIndex
  )
  const reportBody =
    reportSlice === null
      ? '(no override for this section)'
      : truncateLines(safeYamlStringify(reportSlice), 12)

  // ── Map Override (autoplay) ──────────────────────────────────────
  const mapSlice = sliceMapForUnit(
    parsed.mapOverrides,
    unit.parentIndex,
    unit.subIndex
  )
  const mapBody =
    mapSlice === null
      ? '(no override for this section)'
      : truncateLines(safeYamlStringify(mapSlice), 12)

  // ── Narration (autoplay TTS) ─────────────────────────────────────
  const tts = findTtsOverride(
    parsed.tts,
    unit.parentIndex,
    unit.subIndex,
    unit.sliceIndex ?? 0
  )
  const narrationBody = tts
    ? truncateLines(tts.script, 10)
    : '(no override for this section)'

  return [
    {
      id: 'content',
      label: 'Content',
      tag: 'MARKDOWN',
      body: contentBody,
      variant: 'mono',
    },
    {
      id: 'config',
      label: 'Config',
      tag: 'YAML',
      body: configBody,
      variant: 'mono',
    },
    {
      id: 'chart',
      label: 'Chart Data',
      tag: chartHasData ? 'JSON' : '—',
      body: chartBody,
      variant: chartHasData ? 'mono' : 'muted',
    },
    {
      id: 'share',
      label: 'Share Variants',
      tag: shareSlice ? 'YAML' : '—',
      body: shareBody,
      variant: shareSlice ? 'mono' : 'muted',
    },
    {
      id: 'report',
      label: 'Report Override',
      tag: reportSlice ? 'YAML' : '—',
      body: reportBody,
      variant: reportSlice ? 'mono' : 'muted',
    },
    {
      id: 'map-override',
      label: 'Map Override',
      tag: mapSlice ? 'YAML' : '—',
      body: mapBody,
      variant: mapSlice ? 'mono' : 'muted',
    },
    {
      id: 'narration',
      label: 'Narration',
      tag: tts ? 'TEXT' : '—',
      body: narrationBody,
      variant: tts ? 'mono' : 'muted',
    },
  ]
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

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '(failed to stringify JSON)'
  }
}

function safeYamlStringify(value: unknown): string {
  try {
    return yamlStringify(value, { lineWidth: 60 })
  } catch {
    return '(failed to stringify YAML)'
  }
}
