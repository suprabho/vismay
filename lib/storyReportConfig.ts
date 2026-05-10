/**
 * Per-story override config for the /reports builder. Lives in
 * `content/stories/<slug>.report.yaml` (fs) or `stories.report_yaml` (db) —
 * see `contentSource.readReportYaml`.
 *
 * Schema (nested per format — report and slides each carry their own pages):
 *
 *   report:
 *     pages:
 *       - unit: { parentIndex: 0, subIndex: 0 }
 *         include: false                     # skip this unit in the export
 *       - unit: { parentIndex: 1, subIndex: 0 }
 *         heading: "Custom heading"          # overrides the unit heading
 *         subheading: "Custom subheading"
 *         paragraphs: ["..."]                # replaces unit.paragraphs entirely
 *         chartOverride: { id: "alt-chart" } # swap chart id (must exist in registry / data:)
 *         mapOverride:
 *           style: "mapbox://..."
 *           palette: { ... }                 # MapPalette subset
 *           center: [lng, lat]
 *           zoom: 9.2
 *           pitch: 30
 *           bearing: 12
 *   slides:
 *     pages:
 *       - unit: { parentIndex: 0, subIndex: 0 }
 *         heading: "Different heading for slides"
 *         mapOverride:
 *           zoom: 7.5                        # slides-specific camera
 *
 * Legacy shape (still readable): a top-level `pages:` array with no
 * `report:`/`slides:` keys is interpreted as applying to both formats. The
 * builder always writes the nested shape on save, so this only matters until
 * each story has been re-saved once.
 *
 * Unit identity is `(parentIndex, subIndex)` so the override survives
 * markdown reorders as long as the section/subsection layout is stable.
 *
 * Out of scope (deliberate): page reorder, chart-data overrides — neither
 * was selected when scoping the builder.
 */

import { parse as parseYaml } from 'yaml'
import type { ResolvedUnit, MapPalette } from './storyConfig.types'

export type OverrideFormat = 'report' | 'slides'

export interface ReportPageOverride {
  parentIndex: number
  subIndex: number
  include?: boolean
  heading?: string
  subheading?: string
  paragraphs?: string[]
  chartOverride?: { id: string }
  mapOverride?: {
    style?: string
    palette?: MapPalette
    /** Per-page camera (center/zoom/pitch/bearing). Overrides the section's
     *  `map:` block in the story config for the report or slides PDF. */
    center?: [number, number]
    zoom?: number
    pitch?: number
    bearing?: number
  }
}

export interface ReportConfig {
  pages: ReportPageOverride[]
}

export interface StoryOverridesConfig {
  report: ReportConfig
  slides: ReportConfig
}

const EMPTY: ReportConfig = { pages: [] }

function parsePagesArray(pagesRaw: unknown): ReportPageOverride[] {
  if (!Array.isArray(pagesRaw)) return []
  const pages: ReportPageOverride[] = []
  for (const entry of pagesRaw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const unit = e.unit as { parentIndex?: unknown; subIndex?: unknown } | undefined
    if (
      !unit ||
      typeof unit.parentIndex !== 'number' ||
      typeof unit.subIndex !== 'number'
    ) {
      continue
    }
    const page: ReportPageOverride = {
      parentIndex: unit.parentIndex,
      subIndex: unit.subIndex,
    }
    if (typeof e.include === 'boolean') page.include = e.include
    if (typeof e.heading === 'string') page.heading = e.heading
    if (typeof e.subheading === 'string') page.subheading = e.subheading
    if (Array.isArray(e.paragraphs) && e.paragraphs.every((p) => typeof p === 'string')) {
      page.paragraphs = e.paragraphs as string[]
    }
    if (e.chartOverride && typeof e.chartOverride === 'object') {
      const id = (e.chartOverride as { id?: unknown }).id
      if (typeof id === 'string') page.chartOverride = { id }
    }
    if (e.mapOverride && typeof e.mapOverride === 'object') {
      const mo = e.mapOverride as {
        style?: unknown
        palette?: unknown
        center?: unknown
        zoom?: unknown
        pitch?: unknown
        bearing?: unknown
      }
      const out: ReportPageOverride['mapOverride'] = {}
      if (typeof mo.style === 'string') out.style = mo.style
      if (mo.palette && typeof mo.palette === 'object') {
        out.palette = mo.palette as MapPalette
      }
      if (
        Array.isArray(mo.center) &&
        mo.center.length === 2 &&
        typeof mo.center[0] === 'number' &&
        typeof mo.center[1] === 'number'
      ) {
        out.center = [mo.center[0], mo.center[1]]
      }
      if (typeof mo.zoom === 'number') out.zoom = mo.zoom
      if (typeof mo.pitch === 'number') out.pitch = mo.pitch
      if (typeof mo.bearing === 'number') out.bearing = mo.bearing
      if (
        out.style ||
        out.palette ||
        out.center ||
        out.zoom != null ||
        out.pitch != null ||
        out.bearing != null
      ) {
        page.mapOverride = out
      }
    }
    pages.push(page)
  }
  return pages
}

/**
 * Parse the YAML blob into a StoryOverridesConfig with both formats
 * populated. Returns empty configs (pages: []) for absent or empty input.
 *
 * Accepts both the new nested shape (`report:`/`slides:` keys) and the
 * legacy flat shape (top-level `pages:`); legacy is mirrored into both
 * formats so existing stories don't regress until they're re-saved.
 */
export function parseStoryOverrides(raw: string | null): StoryOverridesConfig {
  if (!raw || !raw.trim()) return { report: { pages: [] }, slides: { pages: [] } }
  let doc: unknown
  try {
    doc = parseYaml(raw)
  } catch {
    return { report: { pages: [] }, slides: { pages: [] } }
  }
  if (!doc || typeof doc !== 'object') {
    return { report: { pages: [] }, slides: { pages: [] } }
  }
  const d = doc as Record<string, unknown>
  const reportNode = d.report as { pages?: unknown } | undefined
  const slidesNode = d.slides as { pages?: unknown } | undefined
  if (reportNode || slidesNode) {
    return {
      report: { pages: parsePagesArray(reportNode?.pages) },
      slides: { pages: parsePagesArray(slidesNode?.pages) },
    }
  }
  // Legacy flat shape: a single `pages:` array applied to both formats.
  const flat = parsePagesArray(d.pages)
  return { report: { pages: flat }, slides: { pages: flat } }
}

/**
 * Back-compat wrapper. `parseReportConfig(raw, format)` returns just the
 * per-format ReportConfig, mirroring the old signature shape that callers
 * already use. Pass `'report'` (default) or `'slides'`.
 */
export function parseReportConfig(
  raw: string | null,
  format: OverrideFormat = 'report'
): ReportConfig | null {
  const all = parseStoryOverrides(raw)
  const cfg = all[format]
  if (!raw || !raw.trim()) return null
  return cfg.pages.length > 0 ? cfg : EMPTY
}

function findOverride(
  config: ReportConfig | null,
  parentIndex: number,
  subIndex: number
): ReportPageOverride | undefined {
  if (!config) return undefined
  return config.pages.find(
    (p) => p.parentIndex === parentIndex && p.subIndex === subIndex
  )
}

/**
 * Apply a ReportConfig to a unit list:
 *   1. Drop units where `include === false`.
 *   2. Replace heading/subheading/paragraphs when set.
 *   3. Mutate parentConfig.chart when chartOverride is set (per-unit
 *      override — leaves other units of the same parent untouched).
 *   4. mapOverride is applied opaquely as `__reportMapOverride` on the
 *      parentConfig copy so the shell can pick it up without modifying
 *      MapStep types upstream.
 *
 * Returns a new array; never mutates the input.
 */
export function applyReportOverrides(
  units: ResolvedUnit[],
  config: ReportConfig | null
): ResolvedUnit[] {
  if (!config || config.pages.length === 0) return units
  const out: ResolvedUnit[] = []
  for (const unit of units) {
    const ov = findOverride(config, unit.parentIndex, unit.subIndex)
    if (ov?.include === false) continue
    if (!ov) {
      out.push(unit)
      continue
    }
    const next: ResolvedUnit = {
      ...unit,
      heading: ov.heading ?? unit.heading,
      subheading: ov.subheading ?? unit.subheading,
      paragraphs: ov.paragraphs ?? unit.paragraphs,
    }
    if (ov.chartOverride || ov.mapOverride) {
      // Per-unit clone of the parent config so chart / map overrides don't
      // leak across other units of the same parent section.
      const parent = { ...unit.parentConfig }
      if (ov.chartOverride) parent.chart = ov.chartOverride.id
      if (ov.mapOverride) {
        // Merge camera fields directly into parent.map so existing shells
        // (which already read parent.map.{center,zoom,...}) pick them up.
        // Style/palette can't be merged here — they live on `defaults`, not
        // on the section's map block — so we also stash the full override
        // on a side channel for shells that consume style/palette.
        parent.map = {
          ...parent.map,
          ...(ov.mapOverride.center ? { center: ov.mapOverride.center } : {}),
          ...(ov.mapOverride.zoom != null ? { zoom: ov.mapOverride.zoom } : {}),
          ...(ov.mapOverride.pitch != null ? { pitch: ov.mapOverride.pitch } : {}),
          ...(ov.mapOverride.bearing != null
            ? { bearing: ov.mapOverride.bearing }
            : {}),
        }
        ;(parent as unknown as { __reportMapOverride?: typeof ov.mapOverride }).__reportMapOverride =
          ov.mapOverride
      }
      next.parentConfig = parent
    }
    out.push(next)
  }
  return out
}

/**
 * Helper for shells: read the per-unit map override stash if present.
 * Returns `undefined` when no override applied.
 */
export function getReportMapOverride(
  parentConfig: ResolvedUnit['parentConfig']
): ReportPageOverride['mapOverride'] | undefined {
  return (parentConfig as unknown as { __reportMapOverride?: ReportPageOverride['mapOverride'] })
    .__reportMapOverride
}
