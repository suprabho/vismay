/**
 * Slot-level editing for the canvas's left-side leaf DataNodes.
 *
 * The 5 EditableKinds in `canvasEditing.ts` edit per-section *override* files
 * (share / report / map / tts). This module handles editing the **section
 * config itself** — the layers inside `config.yaml`'s `background` /
 * `foreground.regions[*]` arrays, plus the story's frontmatter `theme`.
 *
 * Three kinds of clickable slots:
 *   - `map`   → opens the visual MapPickerModal
 *   - `image` → opens the asset-picker + adminForm ImageEditModal
 *   - `theme` → opens the existing ThemeEditor inside the side panel
 *
 * Save endpoints (same as EditorClient's tab editors):
 *   - config.yaml   → PUT /api/vizmaya/stories/<slug>  { config_yaml }
 *   - frontmatter   → PUT /api/vizmaya/stories/<slug>  { markdown }
 */

import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import {
  parseFrontmatter,
  serializeFrontmatter,
} from '@vismay/content-source/frontmatter'
import type { Theme } from '@vismay/viz-engine'

/* ─── Slot identity ──────────────────────────────────────────────── */

/**
 * Path to one layer inside a section's config. `legacyMap` is the special
 * case where a section has a top-level `map:` block (no `background`) — the
 * runtime synthesizes a single map layer for it, and the canvas mirrors
 * that with a synthetic `bg:0` leaf.
 */
export type SlotPath =
  | { kind: 'background'; index: number }
  | { kind: 'legacyMap' }
  | { kind: 'foregroundFlat'; index: number }
  | { kind: 'foregroundRegion'; region: string; index: number }

/** Identifies one clickable leaf in the canvas. Attached to InputNodeData. */
export type SlotDescriptor =
  | { kind: 'theme' }
  | { kind: 'layer'; layerType: string; path: SlotPath }

/* ─── Section + layer access ─────────────────────────────────────── */

interface ConfigDoc {
  sections?: unknown[]
  [k: string]: unknown
}

/**
 * Read one section from config.yaml by `parentIndex`. Returns the parsed
 * object (mutable copy) or null if the section doesn't exist, the YAML
 * doesn't parse, or `configYaml` itself is null (story missing config).
 */
export function getSection(
  configYaml: string | null,
  parentIndex: number
): Record<string, unknown> | null {
  if (!configYaml) return null
  const doc = safeParseYaml(configYaml) as ConfigDoc | null
  if (!doc || !Array.isArray(doc.sections)) return null
  const section = doc.sections[parentIndex]
  if (!section || typeof section !== 'object') return null
  return section as Record<string, unknown>
}

/**
 * Read one layer from a section by slot path. Returns null if the path
 * doesn't resolve (slot empty, region missing, etc.).
 */
export function getLayer(
  section: Record<string, unknown>,
  path: SlotPath
): Record<string, unknown> | null {
  switch (path.kind) {
    case 'legacyMap': {
      const map = section.map
      return map && typeof map === 'object' && !Array.isArray(map)
        ? (map as Record<string, unknown>)
        : null
    }
    case 'background': {
      const bg = section.background
      const arr = asArray(bg)
      const layer = arr[path.index]
      return layer && typeof layer === 'object'
        ? (layer as Record<string, unknown>)
        : null
    }
    case 'foregroundFlat': {
      const fg = section.foreground
      const arr = asArray(fg)
      const layer = arr[path.index]
      return layer && typeof layer === 'object'
        ? (layer as Record<string, unknown>)
        : null
    }
    case 'foregroundRegion': {
      const fg = section.foreground
      if (!fg || typeof fg !== 'object' || Array.isArray(fg)) return null
      const regions = (fg as { regions?: Record<string, unknown> }).regions
      if (!regions || typeof regions !== 'object') return null
      const layers = asArray(regions[path.region])
      const layer = layers[path.index]
      return layer && typeof layer === 'object'
        ? (layer as Record<string, unknown>)
        : null
    }
  }
}

/** Returns true if a value coerces to a layer array. */
function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') return [v]
  return []
}

/* ─── Section/layer splicing back into config.yaml ──────────────── */

/**
 * Replace the layer at `path` inside section `parentIndex` with `nextLayer`,
 * and return the updated config.yaml. Round-trips through parse/stringify so
 * comments at the YAML-text level are lost — acceptable for v1 since the
 * leaf-click flow targets values the user is editing visually, not the
 * surrounding doc structure they'd have annotated.
 */
export function replaceLayer(
  configYaml: string | null,
  parentIndex: number,
  path: SlotPath,
  nextLayer: Record<string, unknown>
): string {
  const doc = (safeParseYaml(configYaml) as ConfigDoc | null) ?? {}
  if (!Array.isArray(doc.sections)) doc.sections = []
  const sections = doc.sections as unknown[]
  const section =
    (sections[parentIndex] as Record<string, unknown> | undefined) ?? {}

  switch (path.kind) {
    case 'legacyMap':
      section.map = nextLayer
      break
    case 'background': {
      const arr = ensureLayerArray(section.background)
      arr[path.index] = nextLayer
      section.background = arr
      break
    }
    case 'foregroundFlat': {
      const arr = ensureLayerArray(section.foreground)
      arr[path.index] = nextLayer
      section.foreground = arr
      break
    }
    case 'foregroundRegion': {
      const fg = (section.foreground as Record<string, unknown>) ?? {}
      const regions = (fg.regions as Record<string, unknown>) ?? {}
      const arr = ensureLayerArray(regions[path.region])
      arr[path.index] = nextLayer
      regions[path.region] = arr
      fg.regions = regions
      section.foreground = fg
      break
    }
  }

  sections[parentIndex] = section
  return yamlStringify(doc, { lineWidth: 0 })
}

function ensureLayerArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return [...v]
  if (v && typeof v === 'object') return [v]
  return []
}

/* ─── Theme (frontmatter) splicing ───────────────────────────────── */

/**
 * Replace `theme` in the markdown frontmatter with `nextTheme`. Returns the
 * updated markdown. Preserves body verbatim.
 */
export function replaceTheme(markdown: string, nextTheme: Theme): string {
  const parsed = parseFrontmatter(markdown)
  const nextData = { ...parsed.data, theme: nextTheme }
  return serializeFrontmatter(nextData, parsed.body)
}

/* ─── Save endpoint dispatch ────────────────────────────────────── */

/**
 * Persist a config.yaml change. Resolves on 2xx; rejects with the server's
 * error message on 4xx/5xx.
 */
export async function saveConfigYaml(slug: string, configYaml: string): Promise<void> {
  await putStory(slug, { config_yaml: configYaml })
}

/** Persist a markdown change (used for theme edits via frontmatter). */
export async function saveMarkdown(slug: string, markdown: string): Promise<void> {
  await putStory(slug, { markdown })
}

async function putStory(slug: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/vizmaya/stories/${encodeURIComponent(slug)}`, {
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

/* ─── Story defaults (config.yaml `defaults` block) ─────────────── */

/**
 * Read the story-wide `defaults.mapStyle` (a Mapbox style URL) from the
 * parsed config. Returns null when the config is unset / malformed or the
 * field is absent — caller falls back to the engine-level DEFAULTS
 * (`mapbox://styles/mapbox/dark-v11`) which the public site applies anyway.
 */
export function readDefaultsMapStyle(configYaml: string | null): string | null {
  const doc = safeParseYaml(configYaml)
  if (!doc || typeof doc !== 'object') return null
  const defaults = (doc as { defaults?: unknown }).defaults
  if (!defaults || typeof defaults !== 'object') return null
  const v = (defaults as { mapStyle?: unknown }).mapStyle
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

/**
 * Splice a new `defaults.mapStyle` into the story's config.yaml. Creates the
 * `defaults` block when missing — the schema allows it (StoryDefaults merges
 * with engine DEFAULTS in `loadStoryConfig`) — so callers don't have to
 * branch on whether the story already declared overrides.
 */
export function writeDefaultsMapStyle(
  configYaml: string | null,
  nextStyle: string
): string {
  const doc = (safeParseYaml(configYaml) as Record<string, unknown> | null) ?? {}
  const defaults = (doc.defaults as Record<string, unknown> | undefined) ?? {}
  defaults.mapStyle = nextStyle
  doc.defaults = defaults
  return yamlStringify(doc, { lineWidth: 0 })
}

/* ─── Map slot ↔ MapPickerModal wrapping ────────────────────────── */

/**
 * MapPickerModal patches a section-shaped YAML where the camera lives under a
 * top-level `map:` block. For the modern background-layer shape (a flat object
 * `{ type: 'map', center: [...], zoom: ... }`) we wrap the layer fields under
 * `map:` so the modal's extract/apply helpers find them, then unwrap on save.
 *
 * For legacy sections (where the section's YAML already has a top-level
 * `map:` block), the modal can patch the section text directly — no wrapping
 * needed. Caller picks the strategy based on `SlotPath.kind`.
 */
export function wrapLayerForMapPicker(layer: Record<string, unknown>): string {
  // Strip `type: map` from the wrapped form — the modal doesn't care about it,
  // and leaving it out keeps the wrapped YAML clean. The caller re-adds the
  // `type` key on the modern bg-layer unwrap path.
  const rest: Record<string, unknown> = { ...layer }
  delete rest.type
  return yamlStringify({ map: rest }, { lineWidth: 0 })
}

/**
 * Inverse of `wrapLayerForMapPicker`: pull the `map:` block out and merge
 * with the original layer so non-camera keys (style, pins, opacity…) survive
 * the round-trip. The caller is responsible for re-stamping `type: 'map'`
 * on modern bg-layer paths — legacy `section.map` values don't carry a
 * `type` key, so we leave that decision out of this helper.
 */
export function unwrapLayerFromMapPicker(
  wrappedRaw: string,
  originalLayer: Record<string, unknown>
): Record<string, unknown> {
  const parsed = safeParseYaml(wrappedRaw) as { map?: Record<string, unknown> } | null
  const mapBody = parsed?.map ?? {}
  return {
    ...originalLayer, // keep any keys the picker didn't touch (style, pins…)
    ...mapBody, // overwrite the picker-managed fields (center/zoom/pitch/bearing)
  }
}

/* ─── Helpers ───────────────────────────────────────────────────── */

function safeParseYaml(raw: string | null): unknown {
  if (!raw || !raw.trim()) return null
  try {
    return parseYaml(raw)
  } catch {
    return null
  }
}
