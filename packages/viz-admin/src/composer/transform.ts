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

const clampSize = (n: number) => Math.min(100, Math.max(1, n))

/**
 * Scale a single transform by factor `k` about a pivot (card %). Centers move
 * toward/away from the pivot and the box scales by `k`. Ported from vizmaya's
 * `scaleGroupAround` — for a single element the px conversion cancels per axis,
 * so this works in % space directly. (`k` itself comes from a screen-px distance
 * ratio at the call site, so non-square cards are already accounted for.)
 */
export function scaleTransformAround(
  t: TransformLike,
  k: number,
  pivotXPct: number,
  pivotYPct: number,
): TransformLike {
  const kk = Math.min(12, Math.max(0.05, k))
  const next: TransformLike = {
    ...t,
    xPct: pivotXPct + (t.xPct - pivotXPct) * kk,
    yPct: pivotYPct + (t.yPct - pivotYPct) * kk,
    widthPct: clampSize(t.widthPct * kk),
  }
  if (t.heightPct != null) next.heightPct = clampSize(t.heightPct * kk)
  return next
}

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
