/**
 * Per-story autoplay map override.
 *
 * Lives in `content/stories/<slug>.map.yaml` (fs) or `stories.map_yaml`
 * (db) — see `contentSource.readMapYaml`. Edited via the admin Map tab.
 *
 * Applied ONLY when the story is rendered with `?autoplay=1`. Scroll-mode
 * readers see the unmodified `<slug>.config.yaml`, so this is the seam for
 * tweaking framing/pins/zoom for the muted, video-shaped playback without
 * touching the shared scrollytelling config.
 *
 * Schema:
 *
 *   overrides:
 *     - target: { parentIndex: 1 }                # parent map block
 *       map:
 *         center: [-95, 40]
 *         zoom: 4
 *         pins: [...]
 *     - target: { parentIndex: 1, subIndex: 0 }   # subsection map block
 *       map:
 *         zoom: 5
 *         mobile:                                  # 9:16 (portrait) only
 *           zoom: 3
 *
 * Identity is `(parentIndex, subIndex?)`. Field-level merge for scalars
 * (center / zoom / pitch / bearing / opacity / flySpeed). `pins`, `regions`,
 * and `heatmap` REPLACE — matching how subsection map overrides already
 * work in lib/storyConfig.types.ts. The `mobile` sub-block follows the
 * same rules and applies on portrait viewports (i.e. 9:16 autoplay).
 *
 * Out of scope: layer style overrides, defaults overrides. Add a new
 * top-level key (e.g. `defaults:`) when those land — keep `overrides:`
 * stable.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { MapView } from './yamlMapPatch'
import type {
  MapOverrides,
  StoryConfig,
  SubsectionMapOverride,
} from './storyConfig.types'

export interface MapOverrideEntry {
  parentIndex: number
  /** Undefined targets the parent section's `map:` block. */
  subIndex: number | undefined
  map: SubsectionMapOverride
}

export interface MapOverrideConfig {
  overrides: MapOverrideEntry[]
}

/* ─── Editor-shaped target list ─────────────────────────────────────────── */

/**
 * One overridable map target — either a parent section's `map:` block or
 * one of its subsections'. Built from the parsed StoryConfig so the admin
 * Map tab can render a flat list of (parentIndex, subIndex?) targets with
 * their base camera state, then layer the saved override on top.
 *
 * `baseDesktop` is always defined (parent.map is required by config
 * validation, and subsections inherit center/zoom from the parent when
 * they don't override). `baseMobile` is null when no mobile sub-block
 * exists in the resolved base — the editor uses the desktop view as a
 * starting point in that case (matching MapPickerModal semantics).
 */
export interface MapTarget {
  /** `${parentIndex}.${subIndex ?? '_'}` — the override storage key. */
  key: string
  parentIndex: number
  /** Undefined targets the parent section's `map:` block. */
  subIndex?: number
  /** Display label, e.g. "§0 · hero · hero" or "§1.2 · The misleading spike". */
  label: string
  baseDesktop: MapView
  baseMobile: MapView | null
}

/**
 * Walk the StoryConfig and return one MapTarget per overridable level
 * (parent + each subsection). Pure — safe to call on the server during
 * SSR so the client gets a small, ready-to-render list.
 */
export function buildMapTargets(config: StoryConfig): MapTarget[] {
  const out: MapTarget[] = []
  config.sections.forEach((section, parentIndex) => {
    const parentLabel = sectionLabel(section.id, section.kind, section.text, section.heading)
    const parentDesktop = mapToView(section.map)
    const parentMobile = section.map.mobile ? overlayView(parentDesktop, section.map.mobile) : null
    out.push({
      key: `${parentIndex}._`,
      parentIndex,
      label: `§${parentIndex} · ${parentLabel}`,
      baseDesktop: parentDesktop,
      baseMobile: parentMobile,
    })
    section.subsections?.forEach((sub, subIndex) => {
      const subDesktop = sub.map ? overlayView(parentDesktop, sub.map) : parentDesktop
      // Mobile resolution: subsection.mobile > parent.mobile > null. Match
      // the layering in StoryMapShell so the editor's "starting point" for
      // the mobile target is what the renderer would actually show.
      const subMobileSrc = sub.map?.mobile ?? section.map.mobile ?? null
      const subMobile = subMobileSrc ? overlayView(subDesktop, subMobileSrc) : null
      const subLab = sectionLabel(sub.id, undefined, sub.text, sub.heading)
      out.push({
        key: `${parentIndex}.${subIndex}`,
        parentIndex,
        subIndex,
        label: `§${parentIndex}.${subIndex} · ${subLab}`,
        baseDesktop: subDesktop,
        baseMobile: subMobile,
      })
    })
  })
  return out
}

function sectionLabel(
  id: string | undefined,
  kind: string | undefined,
  text: string | undefined,
  heading: string | undefined
): string {
  // Prefer the most human-readable: heading > text-anchor's last segment >
  // id > kind. Truncate text-anchor refs (which look like "Act II > Title")
  // to the last segment so the list stays scannable.
  if (heading) return truncate(heading, 60)
  if (text) {
    const last = text.split(/\s*>\s*/).pop() ?? text
    return truncate(last, 60)
  }
  if (id) return id
  return kind ?? '(untitled)'
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function mapToView(m: StoryConfig['sections'][number]['map']): MapView {
  return {
    center: m.center,
    zoom: m.zoom,
    pitch: m.pitch ?? 0,
    bearing: m.bearing ?? 0,
  }
}

function overlayView(base: MapView, src: MapOverrides): MapView {
  return {
    center: src.center ?? base.center,
    zoom: src.zoom ?? base.zoom,
    pitch: src.pitch ?? base.pitch,
    bearing: src.bearing ?? base.bearing,
  }
}

/* ─── Editor-side override serialization ───────────────────────────────── */

/**
 * One target's per-mode camera override as held in the editor's local
 * state. Either field can be present independently — `desktop` overrides
 * the autoplay landscape (16:9), `mobile` overrides the autoplay portrait
 * (9:16). When both are absent, the target has no override and is dropped
 * from the saved YAML.
 */
export interface TargetCameraOverride {
  desktop?: MapView
  mobile?: MapView
}

/**
 * Serialize the editor's `Map<targetKey, TargetCameraOverride>` to the
 * `overrides:` YAML blob persisted in `stories.map_yaml`.
 *
 * Returns null when no target has any override worth saving (so the
 * caller can write null to clear the column entirely).
 */
export function serializeOverrides(
  state: Map<string, TargetCameraOverride>,
  targets: MapTarget[]
): string | null {
  const entries: Array<{
    target: { parentIndex: number; subIndex?: number }
    map: Record<string, unknown>
  }> = []

  // Stable order — iterate over `targets`, not the state Map, so the
  // emitted YAML is deterministic regardless of edit order.
  for (const t of targets) {
    const o = state.get(t.key)
    if (!o) continue
    const map: Record<string, unknown> = {}
    if (o.desktop && !sameView(o.desktop, t.baseDesktop)) {
      writeView(map, o.desktop)
    }
    if (o.mobile) {
      // Mobile is "set" relative to the desktop the renderer will
      // actually display — drop it only if it equals the merged desktop
      // (i.e. the user dragged it to match desktop, leaving no mobile
      // delta). Otherwise emit it.
      const effectiveDesktop = o.desktop ?? t.baseDesktop
      if (!sameView(o.mobile, effectiveDesktop)) {
        map.mobile = viewToObject(o.mobile)
      }
    }
    if (Object.keys(map).length === 0) continue
    const target: { parentIndex: number; subIndex?: number } = {
      parentIndex: t.parentIndex,
    }
    if (t.subIndex !== undefined) target.subIndex = t.subIndex
    entries.push({ target, map })
  }

  if (entries.length === 0) return null
  return stringifyYaml({ overrides: entries })
}

/**
 * Inverse of `serializeOverrides`: split a parsed override config into a
 * per-target editor state map. Targets without an override entry are
 * absent from the map (caller treats absence as "no override").
 */
export function hydrateOverrides(
  cfg: MapOverrideConfig | null
): Map<string, TargetCameraOverride> {
  const out = new Map<string, TargetCameraOverride>()
  if (!cfg) return out
  for (const o of cfg.overrides) {
    const key = `${o.parentIndex}.${o.subIndex ?? '_'}`
    const entry: TargetCameraOverride = {}
    const m = o.map
    // A desktop override is "present" when ANY of center/zoom/pitch/bearing
    // is set at the top level of the map block (anything else is layer
    // data we don't surface in the editor).
    if (
      m.center !== undefined ||
      m.zoom !== undefined ||
      m.pitch !== undefined ||
      m.bearing !== undefined
    ) {
      entry.desktop = {
        center: m.center ?? [0, 20],
        zoom: m.zoom ?? 2,
        pitch: m.pitch ?? 0,
        bearing: m.bearing ?? 0,
      }
    }
    if (m.mobile) {
      entry.mobile = {
        center: m.mobile.center ?? entry.desktop?.center ?? [0, 20],
        zoom: m.mobile.zoom ?? entry.desktop?.zoom ?? 2,
        pitch: m.mobile.pitch ?? entry.desktop?.pitch ?? 0,
        bearing: m.mobile.bearing ?? entry.desktop?.bearing ?? 0,
      }
    }
    if (entry.desktop || entry.mobile) out.set(key, entry)
  }
  return out
}

function writeView(out: Record<string, unknown>, v: MapView): void {
  out.center = [round(v.center[0], 4), round(v.center[1], 4)]
  out.zoom = round(v.zoom, 2)
  if (Math.abs(v.pitch) > 0.05) out.pitch = round(v.pitch, 1)
  if (Math.abs(v.bearing) > 0.05) out.bearing = round(v.bearing, 1)
}

function viewToObject(v: MapView): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  writeView(out, v)
  return out
}

function sameView(a: MapView, b: MapView): boolean {
  return (
    round(a.center[0], 4) === round(b.center[0], 4) &&
    round(a.center[1], 4) === round(b.center[1], 4) &&
    round(a.zoom, 2) === round(b.zoom, 2) &&
    round(a.pitch, 1) === round(b.pitch, 1) &&
    round(a.bearing, 1) === round(b.bearing, 1)
  )
}

function round(n: number, places: number): number {
  const p = Math.pow(10, places)
  return Math.round(n * p) / p
}

/**
 * Best-effort parser. Skips entries that fail validation rather than
 * throwing — a malformed save shouldn't break the renderer; the affected
 * unit just falls through to the base config.
 */
export function parseMapOverrides(raw: string | null): MapOverrideConfig | null {
  if (!raw || !raw.trim()) return null
  let doc: unknown
  try {
    doc = parseYaml(raw)
  } catch {
    return null
  }
  if (!doc || typeof doc !== 'object') return null
  const list = (doc as { overrides?: unknown }).overrides
  if (!Array.isArray(list)) return { overrides: [] }

  const overrides: MapOverrideEntry[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const t = e.target as { parentIndex?: unknown; subIndex?: unknown } | undefined
    const m = e.map
    if (!t || typeof t.parentIndex !== 'number') continue
    if (!m || typeof m !== 'object') continue
    const subIndex = typeof t.subIndex === 'number' ? t.subIndex : undefined
    overrides.push({
      parentIndex: t.parentIndex,
      subIndex,
      map: m as SubsectionMapOverride,
    })
  }
  return { overrides }
}

/**
 * Apply scalar fields from `src` onto `dst` and replace pins / regions /
 * heatmap when present in `src`. Mirrors how `StoryMapShell` already
 * resolves subsection overrides on top of the parent block.
 */
function mergeMapBlock<T extends MapOverrides>(dst: T, src: MapOverrides): T {
  const out = { ...dst }
  if (src.center !== undefined) out.center = src.center
  if (src.zoom !== undefined) out.zoom = src.zoom
  if (src.pitch !== undefined) out.pitch = src.pitch
  if (src.bearing !== undefined) out.bearing = src.bearing
  if (src.opacity !== undefined) out.opacity = src.opacity
  if (src.flySpeed !== undefined) out.flySpeed = src.flySpeed
  if (src.pins !== undefined) out.pins = src.pins
  if (src.regions !== undefined) out.regions = src.regions
  if (src.heatmap !== undefined) out.heatmap = src.heatmap
  return out
}

/**
 * Apply every override in `cfg` to a shallow-cloned `config`. Returns a
 * new StoryConfig — does not mutate the input. No-op when `cfg` is null.
 *
 * Out-of-bounds entries (parentIndex / subIndex doesn't exist in the
 * config) are silently skipped so the override file can lag behind
 * structural edits to config.yaml without breaking the renderer.
 *
 * NOTE: callers (StoryMapShell) only invoke this when `isAutoplay` is
 * true. Don't call it unconditionally — scroll mode must see the
 * untouched config.
 */
export function applyMapOverrides(
  config: StoryConfig,
  cfg: MapOverrideConfig | null
): StoryConfig {
  if (!cfg || cfg.overrides.length === 0) return config
  const sections = config.sections.map((s) => ({
    ...s,
    map: { ...s.map },
    subsections: s.subsections?.map((sub) => ({ ...sub })),
  }))
  for (const o of cfg.overrides) {
    const section = sections[o.parentIndex]
    if (!section) continue
    if (o.subIndex === undefined) {
      // Parent-level merge. mergeMapBlock copies scalar/pin/region/heatmap
      // fields; the parent type also carries `mobile`, which we merge
      // separately and reattach.
      const mergedScalars = mergeMapBlock(section.map, o.map)
      const merged: typeof section.map = { ...mergedScalars, mobile: section.map.mobile }
      if (o.map.mobile) {
        merged.mobile = mergeMapBlock(section.map.mobile ?? {}, o.map.mobile)
      }
      section.map = merged
    } else {
      const subs = section.subsections
      if (!subs) continue
      const sub = subs[o.subIndex]
      if (!sub) continue
      const base = sub.map ?? {}
      const merged: SubsectionMapOverride = mergeMapBlock(base, o.map)
      if (o.map.mobile) {
        merged.mobile = mergeMapBlock(base.mobile ?? {}, o.map.mobile)
      }
      subs[o.subIndex] = { ...sub, map: merged }
    }
  }
  return { ...config, sections }
}
