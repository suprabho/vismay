import type { CSSProperties } from 'react'

/**
 * A freely-placed layer's transform. Position is the layer CENTER as a % of the
 * card; `widthPct`/`heightPct` are % of card width/height. Structurally mirrors
 * the vizmaya share-card `Transform` so its control widgets + render CSS hoist
 * here without coupling to vizmaya's layer types.
 */
export interface TransformLike {
  xPct: number
  yPct: number
  widthPct: number
  /** Explicit box height (% of card). Absent = self-sized (aspect/glyph). */
  heightPct?: number
  scale: number
  rotation: number
  opacity: number
}

export const DEFAULT_TRANSFORM: TransformLike = {
  xPct: 50,
  yPct: 50,
  widthPct: 30,
  scale: 1,
  rotation: 0,
  opacity: 1,
}

/** Default box height (% of card) for a box-sized graphic / data card. */
export const DEFAULT_GRAPHIC_HEIGHT_PCT = 55

/**
 * CSS that positions a layer by its transform: center pivot, percent units, with
 * `translate(-50%,-50%) rotate() scale()` about the element center. When
 * `sizeByWidth`, the box gets an explicit width (+ height when `heightPct` is
 * set); otherwise it self-sizes. Ported from vizmaya's `transformWrapperStyle`.
 */
export function transformWrapperStyle(
  t: TransformLike,
  opts: { sizeByWidth?: boolean } = {},
): CSSProperties {
  const size = opts.sizeByWidth
    ? { width: `${t.widthPct}%`, ...(t.heightPct != null ? { height: `${t.heightPct}%` } : {}) }
    : {}
  return {
    position: 'absolute',
    left: `${t.xPct}%`,
    top: `${t.yPct}%`,
    ...size,
    transform: `translate(-50%, -50%) rotate(${t.rotation}deg) scale(${t.scale})`,
    transformOrigin: 'center center',
    opacity: t.opacity,
  }
}
