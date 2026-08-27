import type { CardComposition, ElementLayer } from '../layers/types'

/**
 * Group transforms. A group is an editor-only concept; "transform together" is
 * implemented by REWRITING each member's own `transform` (the flat renderer has
 * no group awareness). Every function here is pure — the canvas captures the
 * composition at pointer-down and recomputes from that start snapshot on each
 * move, so there's no incremental drift.
 *
 * Geometry: positions are the layer CENTER as a % of the card; `widthPct` is a %
 * of card WIDTH and a height is a % of card HEIGHT. Because the card isn't
 * square, rotation/scale are done in card-render PX (renderW × renderH) and
 * converted back to %, so circles stay circles. `previewScale` is uniform, so
 * render-px geometry matches what's on screen.
 */

const clampPct = (n: number) => Math.min(100, Math.max(0, n))
const clampSize = (n: number) => Math.min(500, Math.max(0.5, n))

/** A decoration (emoji/icon/flag/aspect image) with no explicit `heightPct`
 *  renders as a square sized by width — its on-card height in % derives from the
 *  card aspect. Box-sized graphics (chart/map/box-image) carry `heightPct`. This
 *  mirrors the canvas hit-box (`aspectRatio: 1/1` when there's no height). */
export function elemHeightPct(el: ElementLayer, renderW: number, renderH: number): number {
  if (el.transform.heightPct != null) return el.transform.heightPct
  return ((el.transform.widthPct / 100) * renderW / renderH) * 100
}

export interface GroupBBox {
  cx: number
  cy: number
  w: number
  h: number
  left: number
  top: number
  right: number
  bottom: number
}

/** Axis-aligned bounding box (in card %) over a group's members. Each member's
 *  box is its width/height MULTIPLIED by its CSS `scale` (the renderer applies
 *  `scale()` on top of the width sizing), so the frame hugs the rendered art.
 *  Ignores each member's own rotation — it's a handle frame, not a tight hull.
 *  Null if the group has no members. */
export function groupBBox(
  els: ElementLayer[],
  gid: string,
  renderW: number,
  renderH: number,
): GroupBBox | null {
  const members = els.filter((e) => e.groupId === gid)
  if (!members.length) return null
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const m of members) {
    const w = m.transform.widthPct * m.transform.scale
    const h = elemHeightPct(m, renderW, renderH) * m.transform.scale
    left = Math.min(left, m.transform.xPct - w / 2)
    right = Math.max(right, m.transform.xPct + w / 2)
    top = Math.min(top, m.transform.yPct - h / 2)
    bottom = Math.max(bottom, m.transform.yPct + h / 2)
  }
  return { cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top, left, top, right, bottom }
}

function mapMembers(
  c: CardComposition,
  gid: string,
  fn: (e: ElementLayer) => ElementLayer,
): CardComposition {
  return { ...c, elements: c.elements.map((e) => (e.groupId === gid ? fn(e) : e)) }
}

/** Translate every member by (dx, dy) in card %, clamped so no member's CENTER
 *  leaves the canvas (the group stays rigid — the whole delta is clamped, not
 *  each member independently). */
export function moveGroupBy(c: CardComposition, gid: string, dxPct: number, dyPct: number): CardComposition {
  const members = c.elements.filter((e) => e.groupId === gid)
  if (!members.length) return c
  const xs = members.map((m) => m.transform.xPct)
  const ys = members.map((m) => m.transform.yPct)
  const minx = Math.min(...xs)
  const maxx = Math.max(...xs)
  const miny = Math.min(...ys)
  const maxy = Math.max(...ys)
  const dx = Math.min(100 - maxx, Math.max(-minx, dxPct))
  const dy = Math.min(100 - maxy, Math.max(-miny, dyPct))
  return mapMembers(c, gid, (e) => ({
    ...e,
    transform: { ...e.transform, xPct: e.transform.xPct + dx, yPct: e.transform.yPct + dy },
  }))
}

/** Uniformly scale a group by factor `k` about a pivot (in card %). Member
 *  centers move toward/away from the pivot and each member's box (width + any
 *  height) scales by the same factor, so the whole group resizes rigidly. */
export function scaleGroupAround(
  c: CardComposition,
  gid: string,
  k: number,
  pivotXPct: number,
  pivotYPct: number,
  renderW: number,
  renderH: number,
): CardComposition {
  const kk = Math.min(12, Math.max(0.05, k))
  const px = (pivotXPct / 100) * renderW
  const py = (pivotYPct / 100) * renderH
  return mapMembers(c, gid, (e) => {
    const cx = (e.transform.xPct / 100) * renderW
    const cy = (e.transform.yPct / 100) * renderH
    const nx = px + (cx - px) * kk
    const ny = py + (cy - py) * kk
    const t = {
      ...e.transform,
      xPct: (nx / renderW) * 100,
      yPct: (ny / renderH) * 100,
      widthPct: clampSize(e.transform.widthPct * kk),
    }
    if (e.transform.heightPct != null) t.heightPct = clampSize(e.transform.heightPct * kk)
    return { ...e, transform: t }
  })
}

/** Rotate a group by `deg` (clockwise, matching CSS) about a pivot (in card %).
 *  Member centers orbit the pivot and each member's own rotation gains `deg`. */
export function rotateGroupAround(
  c: CardComposition,
  gid: string,
  deg: number,
  pivotXPct: number,
  pivotYPct: number,
  renderW: number,
  renderH: number,
): CardComposition {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const px = (pivotXPct / 100) * renderW
  const py = (pivotYPct / 100) * renderH
  return mapMembers(c, gid, (e) => {
    const cx = (e.transform.xPct / 100) * renderW
    const cy = (e.transform.yPct / 100) * renderH
    const vx = cx - px
    const vy = cy - py
    const rx = vx * cos - vy * sin
    const ry = vx * sin + vy * cos
    return {
      ...e,
      transform: {
        ...e.transform,
        xPct: ((px + rx) / renderW) * 100,
        yPct: ((py + ry) / renderH) * 100,
        rotation: e.transform.rotation + deg,
      },
    }
  })
}

/** Keep x/y readable for callers that need to clamp the final commit. */
export { clampPct }
