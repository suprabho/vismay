/**
 * Remove/delete helpers for the canvas's delete affordance — the inverse
 * of `canvasSlotAdd.ts`.
 *
 * `canvasSlotAdd.ts` covers APPEND/CREATE (add a layer, create a region,
 * seed an override entry). This module covers REMOVE for the same data
 * model: delete a layer from a background/foreground slot, delete a
 * foreground region, and delete a per-section override entry from the
 * override files (share / report / map / tts).
 *
 * Every function returns the updated YAML string. Save dispatch reuses
 * `canvasSlotEditing.saveConfigYaml` / `canvasEditing.saveSlice` — this
 * module only owns YAML manipulation, not the HTTP round-trip.
 *
 * The override removers are forgiving: when the targeted entry doesn't
 * exist they return the input unchanged (formatting intact), so a stale
 * delete (double-click, raced section switch) is a no-op rather than a
 * crash. The config removers throw on an out-of-range section/layer —
 * the canvas indexes by an existing node, so that's a hard error.
 */

import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import type { SlotPath } from './canvasSlotEditing'

/* ─── Section + array access ────────────────────────────────────── */

interface ConfigDoc {
  sections?: unknown[]
  [k: string]: unknown
}

function safeParseYaml(raw: string | null): unknown {
  if (!raw || !raw.trim()) return null
  try {
    return parseYaml(raw)
  } catch {
    return null
  }
}

/** Mirrors the same helper in `canvasSlotAdd.ts` (kept private there) —
 *  parse the config, ensure `sections[parentIndex]` exists, return the
 *  mutable doc + section. */
function mutableConfigSection(
  configYaml: string | null,
  parentIndex: number
): { doc: ConfigDoc; section: Record<string, unknown> } {
  const doc = (safeParseYaml(configYaml) as ConfigDoc | null) ?? {}
  const sections = Array.isArray(doc.sections)
    ? (doc.sections as unknown[])
    : []
  if (parentIndex < 0 || parentIndex >= sections.length) {
    throw new Error(
      `section ${parentIndex} not in config (config has ${sections.length} sections)`
    )
  }
  const section = sections[parentIndex]
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    throw new Error(`section ${parentIndex} is malformed in config`)
  }
  doc.sections = sections
  return { doc, section: section as Record<string, unknown> }
}

/** Coerce a slot value (single layer | array | undefined) to a mutable
 *  layer array. Empty value yields `[]`, single object yields `[value]`. */
function ensureLayerArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return [...(value as Record<string, unknown>[])]
  if (value && typeof value === 'object') return [value as Record<string, unknown>]
  return []
}

function isRegionsShape(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { regions?: unknown }).regions === 'object' &&
    (value as { regions?: unknown }).regions !== null
  )
}

/* ─── Remove a layer (inverse of the append/create helpers) ──────── */

/**
 * Remove the layer at `path` from section `parentIndex` and return the
 * updated config.yaml. Handles the same four slot kinds `replaceLayer`
 * does:
 *   - `legacyMap`          → delete the section's bare `map:` block
 *   - `background[i]`      → splice; the field is dropped when emptied
 *   - `foreground[i]`      → splice (flat shape); dropped when emptied
 *   - `foreground.<r>[i]`  → splice inside the region; the region itself
 *                            survives as `[]` (delete it explicitly via
 *                            `removeForegroundRegion`)
 *
 * Single-object slots (`background: { … }`) are treated as a one-element
 * array, so deleting index 0 drops the field — the exact inverse of the
 * add path's "promote single object to array, push" behaviour.
 */
export function removeLayer(
  configYaml: string | null,
  parentIndex: number,
  path: SlotPath
): string {
  const { doc, section } = mutableConfigSection(configYaml, parentIndex)

  switch (path.kind) {
    case 'legacyMap':
      delete section.map
      break
    case 'background': {
      const arr = ensureLayerArray(section.background)
      if (path.index < 0 || path.index >= arr.length) {
        throw new Error(`background[${path.index}] does not exist`)
      }
      arr.splice(path.index, 1)
      if (arr.length === 0) delete section.background
      else section.background = arr
      break
    }
    case 'foregroundFlat': {
      const fg = section.foreground
      if (isRegionsShape(fg)) {
        throw new Error(
          'foreground is regions-shaped; use a foregroundRegion path'
        )
      }
      const arr = ensureLayerArray(fg)
      if (path.index < 0 || path.index >= arr.length) {
        throw new Error(`foreground[${path.index}] does not exist`)
      }
      arr.splice(path.index, 1)
      if (arr.length === 0) delete section.foreground
      else section.foreground = arr
      break
    }
    case 'foregroundRegion': {
      const fg = section.foreground
      if (!fg || typeof fg !== 'object' || Array.isArray(fg)) {
        throw new Error(
          `foreground is not regions-shaped; region '${path.region}' has no layers to remove`
        )
      }
      const regions = (fg as { regions?: unknown }).regions
      if (!regions || typeof regions !== 'object' || Array.isArray(regions)) {
        throw new Error(`foreground has no regions block`)
      }
      const regionsRec = regions as Record<string, unknown>
      const arr = ensureLayerArray(regionsRec[path.region])
      if (path.index < 0 || path.index >= arr.length) {
        throw new Error(
          `foreground.${path.region}[${path.index}] does not exist`
        )
      }
      arr.splice(path.index, 1)
      // Keep the (possibly empty) region — the user deleted a layer, not
      // the region. An empty region renders as a "(no layers)" band with
      // its +Add affordance intact.
      regionsRec[path.region] = arr
      break
    }
  }

  return yamlStringify(doc, { lineWidth: 0 })
}

/* ─── Remove a foreground region (inverse of addForegroundRegion) ── */

/**
 * Delete `section.foreground.regions[regionKey]` — including any layers
 * inside it (callers gate destructive cases behind a confirm). The
 * `foreground.layout` and sibling regions are untouched. No-op when the
 * region (or the regions block) doesn't exist. Refuses on a flat-shaped
 * foreground, mirroring the add-side guard.
 */
export function removeForegroundRegion(
  configYaml: string | null,
  parentIndex: number,
  regionKey: string
): string {
  const { doc, section } = mutableConfigSection(configYaml, parentIndex)
  const fg = section.foreground
  if (Array.isArray(fg)) {
    throw new Error(
      'foreground is a flat layer stack; it has no regions to remove'
    )
  }
  if (fg && typeof fg === 'object') {
    const regions = (fg as { regions?: unknown }).regions
    if (regions && typeof regions === 'object' && !Array.isArray(regions)) {
      delete (regions as Record<string, unknown>)[regionKey]
    }
  }
  return yamlStringify(doc, { lineWidth: 0 })
}

/* ─── Override entry removers (per-section override files) ───────── */

/** Delete `sections[<sectionId>]` from share.yaml. Inverse of
 *  `seedShareSection`. Unchanged input when the entry doesn't exist. */
export function removeShareSection(
  shareYaml: string | null,
  sectionId: string
): string {
  const doc = safeParseYaml(shareYaml) as Record<string, unknown> | null
  const sections =
    doc && typeof doc.sections === 'object' && doc.sections !== null
      ? (doc.sections as Record<string, unknown>)
      : null
  if (!doc || !sections || !(sectionId in sections)) return shareYaml ?? ''
  delete sections[sectionId]
  return yamlStringify(doc, { lineWidth: 0 })
}

interface ReportPageEntry {
  unit?: { parentIndex?: number; subIndex?: number }
  [k: string]: unknown
}

/** Delete the `<format>.pages[]` entry for `(parentIndex, subIndex)` from
 *  report.yaml. Inverse of `seedReportPage`. */
export function removeReportPage(
  reportYaml: string | null,
  format: 'report' | 'slides',
  parentIndex: number,
  subIndex: number
): string {
  const doc = safeParseYaml(reportYaml) as Record<string, unknown> | null
  const subdoc = doc?.[format] as { pages?: unknown[] } | undefined
  const pages = Array.isArray(subdoc?.pages) ? [...subdoc.pages] : null
  if (!doc || !subdoc || !pages) return reportYaml ?? ''
  const idx = pages.findIndex((p) => {
    const u =
      p && typeof p === 'object' ? (p as ReportPageEntry).unit : undefined
    return u?.parentIndex === parentIndex && u?.subIndex === subIndex
  })
  if (idx === -1) return reportYaml ?? ''
  pages.splice(idx, 1)
  subdoc.pages = pages
  return yamlStringify(doc, { lineWidth: 0 })
}

/** Delete the `overrides[]` entry for `(parentIndex, subIndex)` from
 *  map.yaml. Inverse of `seedMapOverride`; matches the parent-level entry
 *  (subIndex undefined) when `subIndex` is 0, same as the seed/slicers. */
export function removeMapOverride(
  mapYaml: string | null,
  parentIndex: number,
  subIndex: number
): string {
  const doc = safeParseYaml(mapYaml) as Record<string, unknown> | null
  const overrides = Array.isArray(doc?.overrides)
    ? [...(doc.overrides as unknown[])]
    : null
  if (!doc || !overrides) return mapYaml ?? ''
  const idx = overrides.findIndex((o) => {
    const t =
      o && typeof o === 'object'
        ? (o as { target?: { parentIndex?: number; subIndex?: number } })
            .target
        : undefined
    return (
      t?.parentIndex === parentIndex &&
      (t?.subIndex === subIndex ||
        (t?.subIndex === undefined && subIndex === 0))
    )
  })
  if (idx === -1) return mapYaml ?? ''
  overrides.splice(idx, 1)
  doc.overrides = overrides
  return yamlStringify(doc, { lineWidth: 0 })
}

/** Delete the `units[]` entry for `(parentIndex, subIndex, sliceIndex)`
 *  from tts.yaml. Inverse of `seedTtsUnit`. */
export function removeTtsUnit(
  ttsYaml: string | null,
  parentIndex: number,
  subIndex: number,
  sliceIndex: number = 0
): string {
  const doc = safeParseYaml(ttsYaml) as Record<string, unknown> | null
  const units = Array.isArray(doc?.units) ? [...(doc.units as unknown[])] : null
  if (!doc || !units) return ttsYaml ?? ''
  const idx = units.findIndex((u) => {
    const ref =
      u && typeof u === 'object'
        ? (
            u as {
              unit?: {
                parentIndex?: number
                subIndex?: number
                sliceIndex?: number
              }
            }
          ).unit
        : undefined
    return (
      ref?.parentIndex === parentIndex &&
      ref?.subIndex === subIndex &&
      (ref?.sliceIndex ?? 0) === sliceIndex
    )
  })
  if (idx === -1) return ttsYaml ?? ''
  units.splice(idx, 1)
  doc.units = units
  return yamlStringify(doc, { lineWidth: 0 })
}

/* ─── Override existence / triviality probes ─────────────────────── */

/**
 * What the delete affordance needs to know about an override entry before
 * offering itself: does the entry exist at all (no entry → no delete row),
 * and does it carry real content (non-trivial → confirm step). "Trivial"
 * means exactly what the seed helpers write: an empty mapping for share,
 * a bare `unit:` identity for report/slides, an empty `map:` block for
 * map, an empty script for narration.
 */
export interface OverrideState {
  exists: boolean
  nonTrivial: boolean
}

const ABSENT: OverrideState = { exists: false, nonTrivial: false }

export function shareSectionState(
  shareYaml: string | null,
  sectionId: string
): OverrideState {
  const doc = safeParseYaml(shareYaml) as Record<string, unknown> | null
  const sections =
    doc && typeof doc.sections === 'object' && doc.sections !== null
      ? (doc.sections as Record<string, unknown>)
      : null
  if (!sections || !(sectionId in sections)) return ABSENT
  const entry = sections[sectionId]
  const nonTrivial =
    entry != null &&
    (typeof entry !== 'object' || Object.keys(entry).length > 0)
  return { exists: true, nonTrivial }
}

export function reportPageState(
  reportYaml: string | null,
  format: 'report' | 'slides',
  parentIndex: number,
  subIndex: number
): OverrideState {
  const doc = safeParseYaml(reportYaml) as Record<string, unknown> | null
  const subdoc = doc?.[format] as { pages?: unknown[] } | undefined
  const pages = Array.isArray(subdoc?.pages) ? subdoc.pages : []
  const page = pages.find((p) => {
    const u =
      p && typeof p === 'object' ? (p as ReportPageEntry).unit : undefined
    return u?.parentIndex === parentIndex && u?.subIndex === subIndex
  })
  if (!page || typeof page !== 'object') return ABSENT
  const nonTrivial = Object.keys(page).some((k) => k !== 'unit')
  return { exists: true, nonTrivial }
}

export function mapOverrideState(
  mapYaml: string | null,
  parentIndex: number,
  subIndex: number
): OverrideState {
  const doc = safeParseYaml(mapYaml) as Record<string, unknown> | null
  const overrides = Array.isArray(doc?.overrides)
    ? (doc.overrides as unknown[])
    : []
  const entry = overrides.find((o) => {
    const t =
      o && typeof o === 'object'
        ? (o as { target?: { parentIndex?: number; subIndex?: number } })
            .target
        : undefined
    return (
      t?.parentIndex === parentIndex &&
      (t?.subIndex === subIndex ||
        (t?.subIndex === undefined && subIndex === 0))
    )
  })
  if (!entry || typeof entry !== 'object') return ABSENT
  const rec = entry as Record<string, unknown>
  const map = rec.map
  const mapHasContent =
    map != null && (typeof map !== 'object' || Object.keys(map).length > 0)
  const extraKeys = Object.keys(rec).some((k) => k !== 'target' && k !== 'map')
  return { exists: true, nonTrivial: mapHasContent || extraKeys }
}

export function ttsUnitState(
  ttsYaml: string | null,
  parentIndex: number,
  subIndex: number,
  sliceIndex: number = 0
): OverrideState {
  const doc = safeParseYaml(ttsYaml) as Record<string, unknown> | null
  const units = Array.isArray(doc?.units) ? (doc.units as unknown[]) : []
  const entry = units.find((u) => {
    const ref =
      u && typeof u === 'object'
        ? (
            u as {
              unit?: {
                parentIndex?: number
                subIndex?: number
                sliceIndex?: number
              }
            }
          ).unit
        : undefined
    return (
      ref?.parentIndex === parentIndex &&
      ref?.subIndex === subIndex &&
      (ref?.sliceIndex ?? 0) === sliceIndex
    )
  })
  if (!entry || typeof entry !== 'object') return ABSENT
  const script = (entry as { script?: unknown }).script
  const nonTrivial = typeof script === 'string' && script.trim().length > 0
  return { exists: true, nonTrivial }
}
