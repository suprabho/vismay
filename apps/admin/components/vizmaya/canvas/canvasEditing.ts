/**
 * Editing layer for the canvas's 5 override input nodes.
 *
 * Each editable node shows a YAML/text slice of one of the per-story
 * override files (share.yaml / report.yaml / map.yaml / tts.yaml). The
 * functions here:
 *   - extract the full (untruncated) slice for the editor (`buildEditableSlice`)
 *   - splice an edited slice back into the parent file (`mergeSlice`)
 *   - POST the merged file to the right admin endpoint (`saveSlice`)
 *
 * Save is full-file: every endpoint takes the entire YAML body. The user
 * is editing one section/unit-scoped slice; this module owns the
 * round-trip of "slice in editor ↔ full file on disk".
 */

import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import type { ResolvedUnit } from '@vismay/viz-engine'
import type { CanvasSources } from './canvasInputs'

export type EditableKind =
  | 'share'
  | 'slides'
  | 'report'
  | 'map'
  | 'narration'

export interface EditableSlice {
  /** Initial text in the editor — full (untruncated) representation of
   *  whatever this slice maps to in the parent file, or '' if there's no
   *  override yet for this section/unit. */
  text: string
  /** Drives Monaco's syntax highlighting + the placeholder hint. */
  language: 'yaml' | 'plaintext'
  /** Shown as the panel title. */
  title: string
  /** Shown as a placeholder in the editor when text is empty — gives the
   *  user a concrete starting point. */
  placeholder: string
}

/** Build the editor view for one (kind, unit) pair. */
export function buildEditableSlice(
  kind: EditableKind,
  unit: ResolvedUnit,
  sources: CanvasSources
): EditableSlice {
  switch (kind) {
    case 'share': {
      const sectionId =
        unit.parentConfig.id ?? `section-${unit.parentIndex}`
      const doc = safeParseYaml(sources.shareYaml)
      const slice =
        doc && typeof doc === 'object'
          ? (doc as { sections?: Record<string, unknown> }).sections?.[sectionId]
          : undefined
      return {
        text: slice === undefined ? '' : safeStringify(slice),
        language: 'yaml',
        title: `Share Variants · ${sectionId}`,
        placeholder: SHARE_PLACEHOLDER,
      }
    }
    case 'slides':
    case 'report': {
      const format = kind
      const doc = safeParseYaml(sources.reportYaml)
      const pages =
        doc && typeof doc === 'object'
          ? ((doc as Record<string, { pages?: ReportPage[] }>)[format]?.pages ??
            [])
          : []
      const slice = pages.find(
        (p) =>
          p.unit?.parentIndex === unit.parentIndex &&
          p.unit?.subIndex === unit.subIndex
      )
      const label = format === 'slides' ? 'Slides Override' : 'Report Override'
      return {
        text: slice === undefined ? '' : safeStringify(slice),
        language: 'yaml',
        title: `${label} · §${unit.parentIndex}.${unit.subIndex}`,
        placeholder: reportPagePlaceholder(unit, format),
      }
    }
    case 'map': {
      const doc = safeParseYaml(sources.mapYaml)
      const overrides =
        doc && typeof doc === 'object'
          ? ((doc as { overrides?: MapOverrideEntry[] }).overrides ?? [])
          : []
      const slice = overrides.find(
        (o) =>
          o.target?.parentIndex === unit.parentIndex &&
          // map overrides can target the parent (subIndex undefined)
          // or a subsection. For the canvas's section-level frame we
          // match either an exact subIndex match or the parent block
          // when this unit is subIndex 0 — same rule as the slicer in
          // canvasInputs.ts.
          (o.target?.subIndex === unit.subIndex ||
            (o.target?.subIndex === undefined && unit.subIndex === 0))
      )
      return {
        text: slice === undefined ? '' : safeStringify(slice),
        language: 'yaml',
        title: `Map Override · §${unit.parentIndex}.${unit.subIndex}`,
        placeholder: mapOverridePlaceholder(unit),
      }
    }
    case 'narration': {
      const doc = safeParseYaml(sources.ttsYaml)
      const units =
        doc && typeof doc === 'object'
          ? ((doc as { units?: TtsUnitEntry[] }).units ?? [])
          : []
      const sliceIndex = unit.sliceIndex ?? 0
      const slice = units.find(
        (u) =>
          u.unit?.parentIndex === unit.parentIndex &&
          u.unit?.subIndex === unit.subIndex &&
          (u.unit?.sliceIndex ?? 0) === sliceIndex
      )
      return {
        // Narration is plain text — show just the script, not the
        // wrapping YAML envelope.
        text: slice?.script ?? '',
        language: 'plaintext',
        title: `Narration · §${unit.parentIndex}.${unit.subIndex}.${sliceIndex}`,
        placeholder:
          'Custom narration for this unit (leave empty to use the default derived from heading + paragraphs).',
      }
    }
  }
}

/**
 * Merge an edited slice back into the appropriate raw YAML in `sources`.
 * Returns a `CanvasSources`-shaped patch (only the changed field is set)
 * plus the on-disk key for the save endpoint to PUT.
 *
 * Throws if `editedText` doesn't parse as expected — caller should
 * surface the error to the editor.
 */
export interface MergeResult {
  /** Which on-disk field changed: drives endpoint dispatch in `saveSlice`. */
  target: 'share' | 'report' | 'map' | 'tts'
  /** Patch shape — set the matching field on `CanvasSources` and re-derive. */
  patch: Partial<CanvasSources>
  /** Full new file content (null = delete the override). */
  newRaw: string | null
}

export function mergeSlice(
  kind: EditableKind,
  unit: ResolvedUnit,
  sources: CanvasSources,
  editedText: string
): MergeResult {
  const trimmed = editedText.trim()

  switch (kind) {
    case 'share': {
      const sectionId =
        unit.parentConfig.id ?? `section-${unit.parentIndex}`
      const doc =
        (safeParseYaml(sources.shareYaml) as Record<string, unknown> | null) ??
        {}
      const sections =
        ((doc as { sections?: Record<string, unknown> }).sections as
          | Record<string, unknown>
          | undefined) ?? {}
      if (trimmed === '') {
        delete sections[sectionId]
      } else {
        sections[sectionId] = parseYaml(editedText)
      }
      ;(doc as { sections?: Record<string, unknown> }).sections = sections
      const newRaw = yamlStringify(doc)
      return {
        target: 'share',
        patch: { shareYaml: newRaw },
        newRaw,
      }
    }

    case 'slides':
    case 'report': {
      const format = kind
      const doc =
        (safeParseYaml(sources.reportYaml) as Record<string, unknown> | null) ??
        {}
      const subdoc =
        ((doc as Record<string, { pages?: ReportPage[] }>)[format] as
          | { pages?: ReportPage[] }
          | undefined) ?? {}
      const pages = (subdoc.pages ?? []).slice()
      const idx = pages.findIndex(
        (p) =>
          p.unit?.parentIndex === unit.parentIndex &&
          p.unit?.subIndex === unit.subIndex
      )
      if (trimmed === '') {
        if (idx >= 0) pages.splice(idx, 1)
      } else {
        const parsed = parseYaml(editedText) as ReportPage
        // Force the unit identity to match the canvas's anchor unit —
        // protects against a user typo'ing the parentIndex.
        parsed.unit = {
          parentIndex: unit.parentIndex,
          subIndex: unit.subIndex,
        }
        if (idx >= 0) pages[idx] = parsed
        else pages.push(parsed)
      }
      subdoc.pages = pages
      ;(doc as Record<string, unknown>)[format] = subdoc
      const newRaw = yamlStringify(doc)
      return {
        target: 'report',
        patch: { reportYaml: newRaw },
        newRaw,
      }
    }

    case 'map': {
      const doc =
        (safeParseYaml(sources.mapYaml) as Record<string, unknown> | null) ?? {}
      const overrides = (
        ((doc as { overrides?: MapOverrideEntry[] }).overrides ?? []) as MapOverrideEntry[]
      ).slice()
      const idx = overrides.findIndex(
        (o) =>
          o.target?.parentIndex === unit.parentIndex &&
          (o.target?.subIndex === unit.subIndex ||
            (o.target?.subIndex === undefined && unit.subIndex === 0))
      )
      if (trimmed === '') {
        if (idx >= 0) overrides.splice(idx, 1)
      } else {
        const parsed = parseYaml(editedText) as MapOverrideEntry
        // Force the target — same protection as the report case.
        parsed.target = {
          parentIndex: unit.parentIndex,
          subIndex: unit.subIndex,
        }
        if (idx >= 0) overrides[idx] = parsed
        else overrides.push(parsed)
      }
      ;(doc as { overrides?: MapOverrideEntry[] }).overrides = overrides
      const newRaw = yamlStringify(doc)
      return {
        target: 'map',
        patch: { mapYaml: newRaw },
        newRaw,
      }
    }

    case 'narration': {
      const doc =
        (safeParseYaml(sources.ttsYaml) as Record<string, unknown> | null) ?? {}
      const units = (
        ((doc as { units?: TtsUnitEntry[] }).units ?? []) as TtsUnitEntry[]
      ).slice()
      const sliceIndex = unit.sliceIndex ?? 0
      const idx = units.findIndex(
        (u) =>
          u.unit?.parentIndex === unit.parentIndex &&
          u.unit?.subIndex === unit.subIndex &&
          (u.unit?.sliceIndex ?? 0) === sliceIndex
      )
      if (trimmed === '') {
        if (idx >= 0) units.splice(idx, 1)
      } else {
        const entry: TtsUnitEntry = {
          unit: {
            parentIndex: unit.parentIndex,
            subIndex: unit.subIndex,
            sliceIndex,
          },
          script: editedText,
        }
        if (idx >= 0) units[idx] = entry
        else units.push(entry)
      }
      ;(doc as { units?: TtsUnitEntry[] }).units = units
      const newRaw = yamlStringify(doc)
      return {
        target: 'tts',
        patch: { ttsYaml: newRaw },
        newRaw,
      }
    }
  }
}

/**
 * Persist a merged slice to the right admin endpoint. Resolves on 2xx;
 * rejects with the server's error message on 4xx/5xx.
 *
 * Endpoint layout:
 *   share  → PUT  /api/vizmaya/stories/<slug>          { share_yaml }
 *   report → PUT  /api/vizmaya/stories/<slug>/report   { raw }
 *   map    → PUT  /api/vizmaya/stories/<slug>/map      { raw }
 *   tts    → PUT  /api/vizmaya/stories/<slug>/tts      { raw }
 */
export async function saveSlice(
  slug: string,
  result: MergeResult
): Promise<void> {
  const { target, newRaw } = result
  let url: string
  let body: unknown
  if (target === 'share') {
    url = `/api/vizmaya/stories/${encodeURIComponent(slug)}`
    body = { share_yaml: newRaw }
  } else {
    url = `/api/vizmaya/stories/${encodeURIComponent(slug)}/${target}`
    body = { raw: newRaw }
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(
      `Save failed (${res.status})${err?.error ? `: ${err.error}` : ''}`
    )
  }
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function safeParseYaml(raw: string | null): unknown {
  if (!raw || !raw.trim()) return null
  try {
    return parseYaml(raw)
  } catch {
    return null
  }
}

function safeStringify(value: unknown): string {
  try {
    return yamlStringify(value, { lineWidth: 80 })
  } catch {
    return ''
  }
}

/* ─── Per-kind placeholder hints ─────────────────────────────────── */

const SHARE_PLACEHOLDER = `# Share card overrides for this section. Examples:
#
# heading: "Custom share title"
# hidePretext: true
# paragraphsOverride:
#   - "Replacement paragraph 1"
#   - "Replacement paragraph 2"
# ratios:
#   3:4:
#     map:
#       zoom: 6.5`

function reportPagePlaceholder(
  unit: ResolvedUnit,
  format: 'slides' | 'report'
): string {
  return `# ${format === 'slides' ? 'Slides' : 'Report'} override for this section. Examples:
#
# unit: { parentIndex: ${unit.parentIndex}, subIndex: ${unit.subIndex} }
# include: false       # exclude this unit from the export
# heading: "Custom heading"
# paragraphs:
#   - "Replacement paragraph"
# mapOverride:
#   zoom: 7.5
#   pitch: 30`
}

function mapOverridePlaceholder(unit: ResolvedUnit): string {
  return `# Autoplay map override for this unit. Example:
#
# target: { parentIndex: ${unit.parentIndex}, subIndex: ${unit.subIndex} }
# map:
#   center: [78.0, 22.0]
#   zoom: 5.5
#   pitch: 35
#   bearing: 0`
}

/* ─── Local shape mirrors (kept narrow on purpose) ─────────────── */

interface ReportPage {
  unit?: { parentIndex?: number; subIndex?: number }
  [k: string]: unknown
}

interface MapOverrideEntry {
  target?: { parentIndex?: number; subIndex?: number }
  map?: unknown
}

interface TtsUnitEntry {
  unit?: { parentIndex?: number; subIndex?: number; sliceIndex?: number }
  script?: string
}
