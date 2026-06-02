/**
 * Append/seed helpers for the canvas's "+ add" affordance.
 *
 * `canvasSlotEditing.ts` covers REPLACE (edit an existing layer in place).
 * This module covers APPEND/CREATE for the same data model: adding a new
 * layer to a background or foreground region, creating a region that
 * doesn't exist yet, and seeding a per-section override file the section
 * doesn't have an entry in yet.
 *
 * Every function returns the updated YAML string (or a `{ yaml, path }`
 * pair when the caller needs to open an editor on the newly-created slot).
 * Save dispatch reuses `canvasSlotEditing.saveConfigYaml` /
 * `canvasEditing.saveSlice` — this module only owns YAML manipulation, not
 * the HTTP round-trip.
 */

import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import type { SlotPath } from './canvasSlotEditing'

/* ─── Layer seed templates ───────────────────────────────────────── */

/**
 * Minimum viable layer body per canonical type. Fields here are the
 * shortest path to a non-throwing render — image/video/embed/rive need
 * `src`, map needs `center` + `zoom`, chart needs `id`. The user lands in
 * the appropriate editor (visual modal for map/image, YAML for the rest)
 * with these defaults pre-filled.
 *
 * Vertical-scoped types ('fs:standings-table', etc.) hit the fallback —
 * we stamp `type` and leave the rest blank since their config shapes are
 * module-defined and we don't have a canonical seed for them here.
 */
export function seedLayerForType(type: string): Record<string, unknown> {
  switch (type) {
    case 'map':
      // Center on a recognisable point (Asia ~ India) so the picker mounts
      // with a non-degenerate view; the user will pan/zoom from there.
      return { type: 'map', center: [78, 22], zoom: 2 }
    case 'image':
      return { type: 'image', src: '' }
    case 'chart':
      return { type: 'chart', id: '' }
    case 'text':
      // text falls back to the unit's heading/paragraphs when fields are
      // absent — an empty `{ type: 'text' }` is a valid seed.
      return { type: 'text' }
    case 'embed':
      return { type: 'embed', src: '', poster: '' }
    case 'video':
      return { type: 'video', src: '' }
    case 'rive':
      return { type: 'rive', src: '' }
    // Deck-format vizslots. Seeds carry the keys the form exposes so they
    // show as empty inputs; they need not satisfy `parseConfig` (the user
    // fills the form immediately after the slot is created, same as the
    // empty `image` seed above).
    case 'bigStat':
      return { type: 'bigStat', value: '' }
    case 'bodyText':
      return { type: 'bodyText' }
    case 'quote':
      return { type: 'quote', text: '' }
    case 'keyValue':
      return { type: 'keyValue', items: [] }
    case 'table':
      return { type: 'table', columns: [], rows: [] }
    case 'imageGrid':
      return { type: 'imageGrid', items: [] }
    default:
      // Module types (fs:*, f1:*, …) — we don't know the config shape, so
      // seed with just `type`. Layer YAML editor takes over from there.
      return { type }
  }
}

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

/**
 * Parse the config, ensure `sections[parentIndex]` exists, return the
 * mutable doc + section. Throws if the section index is out of range —
 * the canvas indexes by an existing unit, so this is a hard error.
 *
 * Mirrors the same helper in `canvasEditing.ts` (kept private there); we
 * re-implement rather than export to keep the two modules' concerns
 * independent — editing splices a known field; adding splices a new
 * one, sometimes creating its parent containers along the way.
 */
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

/* ─── Append layer to background ────────────────────────────────── */

/**
 * Append `layer` to `section.background`. Handles three starting states:
 *   - `background` absent → create as `[layer]`
 *   - `background` is a single layer object → promote to `[that, layer]`
 *   - `background` is an array → push
 *
 * The legacy `section.map` shape is NOT migrated here: if the canvas
 * shows a legacy synthetic map leaf, the user clicks it (not the +Add)
 * to edit. Adding a new bg layer alongside a legacy map would mean
 * migrating, which the user should opt into explicitly via the Background
 * YAML edit — we don't silently rewrite their YAML on Add.
 *
 * Returns the updated full YAML + the SlotPath that points to the new
 * layer so the caller can open the editor on it.
 */
export function appendBackgroundLayer(
  configYaml: string | null,
  parentIndex: number,
  layer: Record<string, unknown>
): { yaml: string; path: SlotPath } {
  const { doc, section } = mutableConfigSection(configYaml, parentIndex)
  const arr = ensureLayerArray(section.background)
  arr.push(layer)
  section.background = arr
  return {
    yaml: yamlStringify(doc, { lineWidth: 0 }),
    path: { kind: 'background', index: arr.length - 1 },
  }
}

/* ─── Append layer to foreground (flat shape) ───────────────────── */

/**
 * Append `layer` to `section.foreground` treated as a flat layer stack.
 *
 * Refuses to run when foreground is regions-shaped — that would silently
 * clobber the layout/regions structure. The canvas's caller picks the
 * right helper based on shape; this is a belt-and-suspenders guard.
 */
export function appendForegroundFlatLayer(
  configYaml: string | null,
  parentIndex: number,
  layer: Record<string, unknown>
): { yaml: string; path: SlotPath } {
  const { doc, section } = mutableConfigSection(configYaml, parentIndex)
  const fg = section.foreground
  if (isRegionsShape(fg)) {
    throw new Error(
      'foreground is regions-shaped; use appendForegroundRegionLayer instead'
    )
  }
  const arr = ensureLayerArray(fg)
  arr.push(layer)
  section.foreground = arr
  return {
    yaml: yamlStringify(doc, { lineWidth: 0 }),
    path: { kind: 'foregroundFlat', index: arr.length - 1 },
  }
}

/* ─── Append layer to a foreground region ───────────────────────── */

/**
 * Append `layer` to `section.foreground.regions[regionKey]`. The region
 * is created with `[layer]` if it doesn't exist yet.
 *
 * Refuses if foreground is flat (a layer stack with no `regions` key) —
 * promoting flat → regions silently here would lose the user's flat
 * layers. Caller should switch shape via the whole-foreground YAML edit
 * first.
 */
export function appendForegroundRegionLayer(
  configYaml: string | null,
  parentIndex: number,
  regionKey: string,
  layer: Record<string, unknown>
): { yaml: string; path: SlotPath } {
  const { doc, section } = mutableConfigSection(configYaml, parentIndex)
  const fg = (section.foreground as Record<string, unknown> | undefined) ?? {}
  if (fg !== undefined && Array.isArray(section.foreground)) {
    throw new Error(
      'foreground is a flat layer stack; switch to regions shape before adding a region layer'
    )
  }
  const regions =
    (fg.regions as Record<string, unknown> | undefined) ?? {}
  const arr = ensureLayerArray(regions[regionKey])
  arr.push(layer)
  regions[regionKey] = arr
  fg.regions = regions
  section.foreground = fg
  return {
    yaml: yamlStringify(doc, { lineWidth: 0 }),
    path: {
      kind: 'foregroundRegion',
      region: regionKey,
      index: arr.length - 1,
    },
  }
}

/* ─── Add a new (empty) foreground region ────────────────────────── */

/**
 * Create `section.foreground.regions[regionKey] = []`. Idempotent — if
 * the region already exists, returns the input unchanged (caller checked,
 * we double-check). Requires foreground to already be regions-shaped or
 * absent (we'll promote an absent foreground to the minimum regions shape
 * with a placeholder layout). Refuses on flat-shaped foreground.
 */
export function addForegroundRegion(
  configYaml: string | null,
  parentIndex: number,
  regionKey: string,
  layoutHint?: string
): string {
  if (!regionKey || /\s/.test(regionKey)) {
    throw new Error(
      'region key must be a non-empty string with no whitespace'
    )
  }
  const { doc, section } = mutableConfigSection(configYaml, parentIndex)
  const fg = section.foreground
  if (Array.isArray(fg)) {
    throw new Error(
      'foreground is a flat layer stack; switch to regions shape before adding a region'
    )
  }
  // Promote absent → minimum regions shape, using the caller's layoutHint
  // when supplied. layoutHint is the current section's `foreground.layout`
  // if any; falling back to an empty string would write `layout: ""`,
  // which the renderer treats as "no layout" — we'd rather omit the field
  // so the runtime picks the default.
  let target: Record<string, unknown>
  if (!fg) {
    target = { regions: {} }
    if (layoutHint) target.layout = layoutHint
  } else {
    target = fg as Record<string, unknown>
  }
  const regions =
    (target.regions as Record<string, unknown> | undefined) ?? {}
  if (!(regionKey in regions)) {
    regions[regionKey] = []
  }
  target.regions = regions
  section.foreground = target
  return yamlStringify(doc, { lineWidth: 0 })
}

/* ─── Create the background array from scratch ──────────────────── */

/**
 * For sections that have no background at all (`shape: 'none'`), wrap
 * `seedLayer` in a single-element array under `section.background`.
 * Returns the updated YAML + the SlotPath for the new layer at index 0.
 */
export function createBackgroundWithLayer(
  configYaml: string | null,
  parentIndex: number,
  seedLayer: Record<string, unknown>
): { yaml: string; path: SlotPath } {
  const { doc, section } = mutableConfigSection(configYaml, parentIndex)
  section.background = [seedLayer]
  return {
    yaml: yamlStringify(doc, { lineWidth: 0 }),
    path: { kind: 'background', index: 0 },
  }
}

/* ─── Override seed helpers (per-section override files) ────────── */

/**
 * Seed a minimal entry in `share.yaml` for `sectionId` if none exists.
 * Returns the updated raw YAML. Callers should then open the share editor
 * (EditorPanel for kind 'share') so the user can flesh it out.
 *
 * Existing entries are left intact — the seed is idempotent so the user
 * pressing "Add" twice (e.g. by mistake) doesn't wipe their work.
 */
export function seedShareSection(
  shareYaml: string | null,
  sectionId: string
): string {
  const doc =
    (safeParseYaml(shareYaml) as Record<string, unknown> | null) ?? {}
  const sections =
    (doc.sections as Record<string, unknown> | undefined) ?? {}
  if (!(sectionId in sections)) {
    // Empty mapping is a valid seed — the share editor's placeholder hint
    // documents the expected fields, and the renderer treats `{}` as
    // "no overrides for this section".
    sections[sectionId] = {}
  }
  doc.sections = sections
  return yamlStringify(doc, { lineWidth: 0 })
}

/**
 * Seed a minimal `unit` entry in `report.yaml`'s `<format>.pages[]`
 * (where format is 'report' or 'slides'). Returns the updated raw YAML.
 *
 * The seed entry contains only the `unit` identity — the user fills in
 * heading/paragraphs/etc. in the editor. Idempotent: existing entries
 * for this (parentIndex, subIndex) are left alone.
 */
export function seedReportPage(
  reportYaml: string | null,
  format: 'report' | 'slides',
  parentIndex: number,
  subIndex: number
): string {
  const doc =
    (safeParseYaml(reportYaml) as Record<string, unknown> | null) ?? {}
  const subdoc =
    (doc[format] as { pages?: unknown[] } | undefined) ?? {}
  const pages = Array.isArray(subdoc.pages) ? [...subdoc.pages] : []
  const existing = pages.findIndex((p) => {
    const u =
      p && typeof p === 'object'
        ? (p as { unit?: { parentIndex?: number; subIndex?: number } }).unit
        : undefined
    return u?.parentIndex === parentIndex && u?.subIndex === subIndex
  })
  if (existing === -1) {
    pages.push({ unit: { parentIndex, subIndex } })
  }
  subdoc.pages = pages
  doc[format] = subdoc
  return yamlStringify(doc, { lineWidth: 0 })
}

/**
 * Seed a minimal `target` entry in `map.yaml`'s `overrides[]`. The seed
 * map block is empty — the user fills in center/zoom/etc. in the editor.
 * Idempotent on (parentIndex, subIndex).
 */
export function seedMapOverride(
  mapYaml: string | null,
  parentIndex: number,
  subIndex: number
): string {
  const doc =
    (safeParseYaml(mapYaml) as Record<string, unknown> | null) ?? {}
  const overrides = Array.isArray(doc.overrides)
    ? [...(doc.overrides as unknown[])]
    : []
  const existing = overrides.findIndex((o) => {
    const t =
      o && typeof o === 'object'
        ? (o as { target?: { parentIndex?: number; subIndex?: number } }).target
        : undefined
    return (
      t?.parentIndex === parentIndex &&
      (t?.subIndex === subIndex ||
        (t?.subIndex === undefined && subIndex === 0))
    )
  })
  if (existing === -1) {
    overrides.push({ target: { parentIndex, subIndex }, map: {} })
  }
  doc.overrides = overrides
  return yamlStringify(doc, { lineWidth: 0 })
}

/**
 * Seed a minimal `unit` entry in `tts.yaml`'s `units[]`. The seed script
 * is empty — the user types narration in the editor. Idempotent on
 * (parentIndex, subIndex, sliceIndex).
 */
export function seedTtsUnit(
  ttsYaml: string | null,
  parentIndex: number,
  subIndex: number,
  sliceIndex: number = 0
): string {
  const doc =
    (safeParseYaml(ttsYaml) as Record<string, unknown> | null) ?? {}
  const units = Array.isArray(doc.units)
    ? [...(doc.units as unknown[])]
    : []
  const existing = units.findIndex((u) => {
    const ref =
      u && typeof u === 'object'
        ? (u as {
            unit?: {
              parentIndex?: number
              subIndex?: number
              sliceIndex?: number
            }
          }).unit
        : undefined
    return (
      ref?.parentIndex === parentIndex &&
      ref?.subIndex === subIndex &&
      (ref?.sliceIndex ?? 0) === sliceIndex
    )
  })
  if (existing === -1) {
    units.push({
      unit: { parentIndex, subIndex, sliceIndex },
      script: '',
    })
  }
  doc.units = units
  return yamlStringify(doc, { lineWidth: 0 })
}

/* ─── Shape detection ───────────────────────────────────────────── */

function isRegionsShape(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { regions?: unknown }).regions === 'object' &&
    (value as { regions?: unknown }).regions !== null
  )
}
