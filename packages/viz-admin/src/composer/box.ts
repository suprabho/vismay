import type { CSSProperties } from 'react'

/**
 * Optional decorative panel rendered BEHIND a free-mode layer's content: a
 * filled, bordered, rounded box with backdrop blur + a drop shadow. Lets any
 * card (match timeline, standings, …) sit on a styled surface instead of
 * bleeding straight onto the card background.
 *
 * Colors are concrete hex — the fill is emitted as `rgba(fill, fillOpacity)` so
 * the html-to-image capture never sees an unresolved `var()`. Absent or
 * `enabled:false` means the layer renders bare (the original behaviour), so the
 * field is fully additive and round-trips opaquely in each host's snapshot.
 */
export interface LayerBox {
  enabled: boolean
  /** Background fill (concrete hex). Rendered as rgba(fill, fillOpacity). */
  fill: string
  fillOpacity: number
  /** Corner radius in px (the box's "roundness"). */
  radiusPx: number
  borderWidthPx: number
  borderColor: string
  /** Backdrop blur in px (frosts whatever sits behind the box). */
  blurPx: number
  shadow: boolean
}

export const DEFAULT_LAYER_BOX: LayerBox = {
  enabled: true,
  fill: '#000000',
  fillOpacity: 0.4,
  radiusPx: 16,
  borderWidthPx: 0,
  borderColor: '#ffffff',
  blurPx: 0,
  shadow: false,
}

const BOX_SHADOW = '0 8px 24px rgba(0, 0, 0, 0.35)'

/** Hex (#rgb or #rrggbb) + alpha → `rgba()`. A non-hex color (CSS keyword /
 *  already-rgba) passes through unchanged — the alpha is left to that color. */
function rgba(color: string, alpha: number): string {
  const s = color.trim()
  let h = /^#?([0-9a-f]{3})$/i.exec(s)?.[1]
  if (h) h = h.split('').map((c) => c + c).join('')
  else h = /^#?([0-9a-f]{6})$/i.exec(s)?.[1]
  if (!h) return s
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** CSS for a layer's background panel, or `undefined` when the box is absent or
 *  disabled (the layer renders bare). The caller puts this on the layer's
 *  content wrapper — that wrapper's `overflow:hidden` clips content to the
 *  radius. */
export function layerBoxStyle(box: LayerBox | undefined): CSSProperties | undefined {
  if (!box || !box.enabled) return undefined
  const blur = box.blurPx > 0 ? `blur(${box.blurPx}px)` : undefined
  return {
    background: rgba(box.fill, box.fillOpacity),
    borderRadius: box.radiusPx || undefined,
    border: box.borderWidthPx > 0 ? `${box.borderWidthPx}px solid ${box.borderColor}` : undefined,
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    boxShadow: box.shadow ? BOX_SHADOW : undefined,
  }
}
