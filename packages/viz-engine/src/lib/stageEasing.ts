import type { StageEasing } from './storyConfig.types'

/**
 * Shared easing math for the stage timeline and section transitions.
 *
 * `cssEasing` renders a `StageEasing` as a CSS `transition-timing-function`
 * (moved here from StageVizSlot); `evalEasing` evaluates the SAME curves in
 * JS for the rAF sampler. Named easings map to the control points CSS uses,
 * so a CSS-driven transition and the JS evaluator agree — the identical
 * solver lives in viz-admin's `resolveClipFrame.ts` (re-pointing it at this
 * export is a planned follow-up).
 */

export function cssEasing(e: StageEasing): string {
  if (typeof e === 'object') return `cubic-bezier(${e.cubicBezier.join(',')})`
  switch (e) {
    case 'easeIn':
      return 'ease-in'
    case 'easeOut':
      return 'ease-out'
    case 'easeInOut':
      return 'ease-in-out'
    case 'ease':
      return 'ease'
    default:
      return 'linear'
  }
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

const NAMED_BEZIER: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
}

/** Solve a cubic-bezier timing function for y at parameter x∈[0,1]. */
function cubicBezier(p: [number, number, number, number], x: number): number {
  const [x1, y1, x2, y2] = p
  // Newton-Raphson on the x(t) curve to find t for the given x, then read y(t).
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  let t = x
  for (let i = 0; i < 8; i++) {
    const dx = sampleX(t) - x
    if (Math.abs(dx) < 1e-5) break
    const d = sampleDX(t)
    if (Math.abs(d) < 1e-6) break
    t -= dx / d
  }
  return sampleY(clamp01(t))
}

/** Evaluate an easing curve at linear progress t∈[0,1] (clamped). */
export function evalEasing(easing: StageEasing | undefined, t: number): number {
  const x = clamp01(t)
  if (!easing || easing === 'linear') return x
  if (typeof easing === 'object') return cubicBezier(easing.cubicBezier, x)
  return cubicBezier(NAMED_BEZIER[easing] ?? NAMED_BEZIER.easeInOut, x)
}
