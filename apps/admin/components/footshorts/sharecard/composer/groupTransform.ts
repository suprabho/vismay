import type { Overlay } from '../types'
import type { OverlayDoc } from './overlayMutations'

/**
 * Group transforms for footshorts overlays. Adapted from the vizmaya composer's
 * `groupTransform.ts`, retyped to the FLAT `Overlay` (`xPct`/`scale`/`rotation`
 * read with defaults, since they're optional). "Transform together" rewrites
 * each member's own flat fields — the renderer has no group awareness. Pure: the
 * canvas snapshots the doc at pointer-down and recomputes from that start on
 * every move, so there's no incremental drift.
 *
 * Geometry: positions are the element CENTER as a % of the card; rotation/scale
 * are done in card-render PX (renderW × renderH) and converted back to %, so a
 * uniform `previewScale` keeps on-screen geometry matching the math.
 */

const clampSize = (n: number) => Math.min(500, Math.max(0.5, n))

/** A footshorts overlay is a square sized by width (no explicit `heightPct`
 *  except box-fit images) — its on-card height in % derives from the card
 *  aspect, mirroring the canvas hit-box (`aspectRatio: 1/1`). */
export function overlayHeightPct(o: Overlay, renderW: number, renderH: number): number {
  if (o.heightPct != null) return o.heightPct
  return ((o.widthPct / 100) * renderW) / renderH * 100
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
 *  box is its width/height MULTIPLIED by its `scale`. Ignores each member's own
 *  rotation — a handle frame, not a tight hull. Null if the group is empty. */
export function groupBBox(
  overlays: Overlay[],
  gid: string,
  renderW: number,
  renderH: number,
): GroupBBox | null {
  const members = overlays.filter((e) => e.groupId === gid)
  if (!members.length) return null
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const m of members) {
    const s = m.scale ?? 1
    const w = m.widthPct * s
    const h = overlayHeightPct(m, renderW, renderH) * s
    left = Math.min(left, m.xPct - w / 2)
    right = Math.max(right, m.xPct + w / 2)
    top = Math.min(top, m.yPct - h / 2)
    bottom = Math.max(bottom, m.yPct + h / 2)
  }
  return { cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top, left, top, right, bottom }
}

function mapMembers(doc: OverlayDoc, gid: string, fn: (e: Overlay) => Overlay): OverlayDoc {
  return { ...doc, overlays: doc.overlays.map((e) => (e.groupId === gid ? fn(e) : e)) }
}

/** Translate every member by (dx, dy) in card %, clamped so no member's CENTER
 *  leaves the canvas (the group stays rigid). */
export function moveGroupBy(doc: OverlayDoc, gid: string, dxPct: number, dyPct: number): OverlayDoc {
  const members = doc.overlays.filter((e) => e.groupId === gid)
  if (!members.length) return doc
  const xs = members.map((m) => m.xPct)
  const ys = members.map((m) => m.yPct)
  const dx = Math.min(100 - Math.max(...xs), Math.max(-Math.min(...xs), dxPct))
  const dy = Math.min(100 - Math.max(...ys), Math.max(-Math.min(...ys), dyPct))
  return mapMembers(doc, gid, (e) => ({ ...e, xPct: e.xPct + dx, yPct: e.yPct + dy }))
}

/** Uniformly scale a group by factor `k` about a pivot (in card %). Member
 *  centers move toward/away from the pivot and each member's box scales by `k`. */
export function scaleGroupAround(
  doc: OverlayDoc,
  gid: string,
  k: number,
  pivotXPct: number,
  pivotYPct: number,
  renderW: number,
  renderH: number,
): OverlayDoc {
  const kk = Math.min(12, Math.max(0.05, k))
  const px = (pivotXPct / 100) * renderW
  const py = (pivotYPct / 100) * renderH
  return mapMembers(doc, gid, (e) => {
    const cx = (e.xPct / 100) * renderW
    const cy = (e.yPct / 100) * renderH
    const nx = px + (cx - px) * kk
    const ny = py + (cy - py) * kk
    const next: Overlay = {
      ...e,
      xPct: (nx / renderW) * 100,
      yPct: (ny / renderH) * 100,
      widthPct: clampSize(e.widthPct * kk),
    }
    if (e.heightPct != null) next.heightPct = clampSize(e.heightPct * kk)
    return next
  })
}

/** Rotate a group by `deg` (clockwise) about a pivot (in card %). Member centers
 *  orbit the pivot and each member's own rotation gains `deg`. */
export function rotateGroupAround(
  doc: OverlayDoc,
  gid: string,
  deg: number,
  pivotXPct: number,
  pivotYPct: number,
  renderW: number,
  renderH: number,
): OverlayDoc {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const px = (pivotXPct / 100) * renderW
  const py = (pivotYPct / 100) * renderH
  return mapMembers(doc, gid, (e) => {
    const vx = (e.xPct / 100) * renderW - px
    const vy = (e.yPct / 100) * renderH - py
    const rx = vx * cos - vy * sin
    const ry = vx * sin + vy * cos
    return {
      ...e,
      xPct: ((px + rx) / renderW) * 100,
      yPct: ((py + ry) / renderH) * 100,
      rotation: (e.rotation ?? 0) + deg,
    }
  })
}
