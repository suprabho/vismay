import type {
  StorySectionConfig,
  VizLayer,
  ForegroundSlotInput,
  BackgroundSlotInput,
} from './storyConfig.types'

/**
 * Back-compat shim. Translates a section's legacy `chart:` and `map:` fields
 * into uniform `foreground` / `background` layer arrays. New stories that
 * already declare `foreground:` / `background:` pass through unchanged.
 *
 * The shim is read-only — it returns a derived view, it does NOT mutate the
 * section. Existing YAML continues to validate against the same legacy rules.
 */

export type ResolvedLayers = {
  /** Always an array. Empty if the section declares no foreground. */
  foreground: VizLayer[]
  /** Always an array. Length 0 means "background slot suppressed" (e.g. `{ type: 'none' }`). */
  background: VizLayer[]
}

function asArray(input: ForegroundSlotInput | BackgroundSlotInput | undefined): VizLayer[] {
  if (input == null) return []
  if (Array.isArray(input)) return input
  if (typeof input === 'object' && 'type' in input && input.type === 'none') return []
  return [input as VizLayer]
}

export function resolveSlots(section: StorySectionConfig): ResolvedLayers {
  const foreground: VizLayer[] = (() => {
    if (section.foreground !== undefined) return asArray(section.foreground)
    if (typeof section.chart === 'string' && section.chart.trim().length > 0) {
      return [{ type: 'chart', id: section.chart }]
    }
    return []
  })()

  const background: VizLayer[] = (() => {
    if (section.background !== undefined) return asArray(section.background)
    // Every legacy section carries a top-level `map` block — synthesize a single map layer.
    if (section.map && Array.isArray(section.map.center)) {
      return [{ type: 'map', ...section.map }]
    }
    return []
  })()

  return { foreground, background }
}
