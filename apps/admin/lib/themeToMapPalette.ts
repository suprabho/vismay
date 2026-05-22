import type { Theme } from '@vismay/viz-engine'
import type { MapPalette } from '@vismay/viz-engine'

/**
 * Admin copy of vizmaya-fyi's themeToMapPalette. Pure derivation — eventually
 * belongs in a shared package once both apps consume it. Kept verbatim so
 * canvas frames and the public site render maps with identical fallbacks.
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
