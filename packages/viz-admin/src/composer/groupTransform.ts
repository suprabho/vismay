import type { ComposerLayer, ComposerState } from './types'
import { DEFAULT_TRANSFORM, type TransformLike } from './transform'

/**
 * Group transform geometry, ported from the vizmaya share-card composer. Pure
 * functions: the canvas snapshots the state at pointer-down and recomputes from
 * it on each move. Positions are layer CENTER as a % of the card; rotation/scale
 * are done in card-render px (renderW × renderH) and converted back to %, so a
 * non-square card doesn't distort circles.
 */

function tOf(l: ComposerLayer): TransformLike {
  return l.transform ?? DEFAULT_TRANSFORM
}

/** Effective box height (% of card): explicit `heightPct`, else the width (a
 *  square-ish self-sized fallback — good enough for the selection bbox). */
function heightPctOf(l: ComposerLayer): number {
  const t = tOf(l)
  return t.heightPct ?? t.widthPct
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

/** Axis-aligned bounding box (card %) over a group's members (scaled by `scale`,
 *  ignoring member rotation). */
export function groupBBox(layers: ComposerLayer[], gid: string): GroupBBox | null {
  const members = layers.filter((l) => l.groupId === gid)
  if (!members.length) return null
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const m of members) {
    const t = tOf(m)
    const w = t.widthPct * t.scale
    const h = heightPctOf(m) * t.scale
    left = Math.min(left, t.xPct - w / 2)
    right = Math.max(right, t.xPct + w / 2)
    top = Math.min(top, t.yPct - h / 2)
    bottom = Math.max(bottom, t.yPct + h / 2)
  }
  return {
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    w: right - left,
    h: bottom - top,
    left,
    top,
    right,
    bottom,
  }
}

function mapMembers(
  state: ComposerState,
  gid: string,
  fn: (l: ComposerLayer) => ComposerLayer,
): ComposerState {
  return { ...state, layers: state.layers.map((l) => (l.groupId === gid ? fn(l) : l)) }
}

/** Translate every group member rigidly by (dx, dy) in card %, clamped so no
 *  member CENTER leaves the canvas. */
export function moveGroupBy(state: ComposerState, gid: string, dxPct: number, dyPct: number): ComposerState {
  const members = state.layers.filter((l) => l.groupId === gid)
  if (!members.length) return state
  const xs = members.map((m) => tOf(m).xPct)
  const ys = members.map((m) => tOf(m).yPct)
  const dx = Math.min(100 - Math.max(...xs), Math.max(-Math.min(...xs), dxPct))
  const dy = Math.min(100 - Math.max(...ys), Math.max(-Math.min(...ys), dyPct))
  return mapMembers(state, gid, (l) => {
    const t = tOf(l)
    return { ...l, transform: { ...t, xPct: t.xPct + dx, yPct: t.yPct + dy } }
  })
}

/** Uniformly scale group members by `k` about a pivot (card %). */
export function scaleGroupAround(
  state: ComposerState,
  gid: string,
  k: number,
  pivotXPct: number,
  pivotYPct: number,
  renderW: number,
  renderH: number,
): ComposerState {
  const kk = Math.min(12, Math.max(0.05, k))
  const px = (pivotXPct / 100) * renderW
  const py = (pivotYPct / 100) * renderH
  return mapMembers(state, gid, (l) => {
    const t = tOf(l)
    const cx = (t.xPct / 100) * renderW
    const cy = (t.yPct / 100) * renderH
    const nx = px + (cx - px) * kk
    const ny = py + (cy - py) * kk
    return {
      ...l,
      transform: {
        ...t,
        xPct: (nx / renderW) * 100,
        yPct: (ny / renderH) * 100,
        scale: Math.min(20, Math.max(0.05, t.scale * kk)),
      },
    }
  })
}

/** Rotate group members by `deg` about a pivot (card %): centers orbit the pivot
 *  and each member's own rotation gains `deg`. */
export function rotateGroupAround(
  state: ComposerState,
  gid: string,
  deg: number,
  pivotXPct: number,
  pivotYPct: number,
  renderW: number,
  renderH: number,
): ComposerState {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const px = (pivotXPct / 100) * renderW
  const py = (pivotYPct / 100) * renderH
  return mapMembers(state, gid, (l) => {
    const t = tOf(l)
    const vx = (t.xPct / 100) * renderW - px
    const vy = (t.yPct / 100) * renderH - py
    const rx = vx * cos - vy * sin
    const ry = vx * sin + vy * cos
    return {
      ...l,
      transform: {
        ...t,
        xPct: ((px + rx) / renderW) * 100,
        yPct: ((py + ry) / renderH) * 100,
        rotation: t.rotation + deg,
      },
    }
  })
}
