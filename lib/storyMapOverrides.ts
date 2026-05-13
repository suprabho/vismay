/**
 * Per-story map override.
 *
 * Lives in `content/stories/<slug>.map.yaml` (fs) or `stories.map_yaml` (db) —
 * see `contentSource.readMapYaml`. The admin Map tab edits this blob; the
 * renderer applies it on top of the resolved config in `loadStoryConfig`.
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
 *         mobile:
 *           zoom: 3
 *
 * Identity is `(parentIndex, subIndex?)`. Field-level merge for scalars
 * (center / zoom / pitch / bearing / opacity / flySpeed). `pins`, `regions`,
 * and `heatmap` REPLACE — matching how subsection map overrides already work
 * in lib/storyConfig.types.ts. The `mobile` sub-block follows the same rules.
 *
 * Out of scope: layer style overrides, defaults overrides. Add a new
 * top-level key (e.g. `defaults:`) when those land — keep `overrides:` stable.
 */

import { parse as parseYaml } from 'yaml'
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
    const subIndex =
      typeof t.subIndex === 'number' ? t.subIndex : undefined
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
 * Apply every override in `cfg` to a shallow-cloned `config`. Returns a new
 * StoryConfig — does not mutate the input. No-op when `cfg` is null.
 *
 * Out-of-bounds entries (parentIndex / subIndex doesn't exist in the config)
 * are silently skipped so the override file can lag behind structural edits
 * to config.yaml without breaking the renderer.
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
