import type { Theme } from '@/types/story'
import type { MapPalette } from './storyConfig.types'

/**
 * Derive a Mapbox `MapPalette` from a story `Theme` so maps inherit the
 * page's palette without per-story yaml. Applied as a fallback in
 * `app/story/[slug]/page.tsx` when the config doesn't set `mapPalette`
 * explicitly; yaml values always win.
 *
 * Mapping (semantic, direction-agnostic):
 *   land       ← lighter of {background, surface}  (subtle lift off water)
 *   water      ← darker  of {background, surface}  (conventional: water deeper)
 *   border     ← muted
 *   labelText  ← text
 *   labelHalo  ← water tone  (halos melt into the map, text carries contrast)
 *   building   ← surface
 *
 * Road line layers and label categories (place/road/transit/poi) are not
 * populated here — `applyMapPalette` hides them by default so the base map
 * stays quiet. Stories that need roads or labels back set the category
 * overrides explicitly in their config.
 *
 * Picking land/water by relative luminance (rather than aliasing
 * `surface` → land blindly) keeps the convention intact on light themes,
 * where `surface` may be darker than `background`.
 */
export function themeToMapPalette(theme: Theme): MapPalette {
  const { background, surface, muted, text } = theme.colors
  const bgL = luminance(background)
  const surfaceL = luminance(surface)
  const land = surfaceL >= bgL ? surface : background
  const water = surfaceL >= bgL ? background : surface

  return {
    land,
    water,
    border: muted,
    labelText: text,
    labelHalo: water,
    building: surface,
  }
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 0xff) / 255
  const g = ((n >> 8) & 0xff) / 255
  const b = (n & 0xff) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
