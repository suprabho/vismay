/**
 * Frame interpolation for the animated tactics board. Pure — no React, no DOM —
 * so it stays trivially testable and reusable by any future provider adapter.
 */

import type { Frame, PlayerSnapshot } from './types'

export interface Snapshot {
  players: PlayerSnapshot[]
  ball: { x: number; y: number }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Return the interpolated `{ players, ball }` snapshot at time `t` (seconds).
 *
 * Linear interpolation per coordinate between the two surrounding keyframes.
 * Outside the frame range, the nearest boundary frame is returned unchanged.
 * Players are matched by `id`; a player present in only one of the two
 * surrounding frames holds that frame's position.
 */
export function interpolateFrames(frames: readonly Frame[], t: number): Snapshot {
  if (frames.length === 0) {
    return { players: [], ball: { x: 50, y: 50 } }
  }

  // Defensive: never assume the author sorted the keyframes.
  const sorted = [...frames].sort((a, b) => a.t - b.t)
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!

  if (t <= first.t) return frameSnapshot(first)
  if (t >= last.t) return frameSnapshot(last)

  let lo = first
  let hi = last
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!
    const b = sorted[i + 1]!
    if (t >= a.t && t <= b.t) {
      lo = a
      hi = b
      break
    }
  }

  const span = hi.t - lo.t
  const alpha = span === 0 ? 0 : (t - lo.t) / span

  const hiById = new Map(hi.players.map((p) => [p.id, p]))
  const players: PlayerSnapshot[] = lo.players.map((p) => {
    const q = hiById.get(p.id)
    if (!q) return { ...p }
    return { ...p, x: lerp(p.x, q.x, alpha), y: lerp(p.y, q.y, alpha) }
  })

  // Carry players that only appear in the later frame.
  const loIds = new Set(lo.players.map((p) => p.id))
  for (const q of hi.players) {
    if (!loIds.has(q.id)) players.push({ ...q })
  }

  return {
    players,
    ball: {
      x: lerp(lo.ball.x, hi.ball.x, alpha),
      y: lerp(lo.ball.y, hi.ball.y, alpha),
    },
  }
}

function frameSnapshot(frame: Frame): Snapshot {
  return {
    players: frame.players.map((p) => ({ ...p })),
    ball: { ...frame.ball },
  }
}
