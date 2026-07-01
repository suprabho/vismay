import type { StageEasing } from '@vismay/viz-engine'
import type { TransformLike } from '../composer/transform'
import type { EnterExitAnim, VideoClip } from './types'

/**
 * Time-keyed clip sampler — the freeform-video analogue of the stage system's
 * beat-keyed `resolveStage` ( packages/viz-engine/src/lib/resolveStage.ts ).
 *
 * A clip's on-timeline lifetime + its enter/exit ramps form an implicit
 * three-keyframe transform track in *time* (enter-from → settled → exit-to),
 * exactly mirroring how a stage entity's `enterTransform` / keyframes /
 * `exitTransform` form a track in *beat* space. The stage renderer leans on CSS
 * transitions to smooth between settled poses, so its resolver only lerps
 * linearly; a frame-by-frame headless render has no CSS transition to ride, so
 * here we evaluate the easing ourselves and lerp the `TransformLike` channels.
 *
 * The SAME function feeds the editor's live preview and the headless render
 * surface, so what you scrub is what you export — pixel-identical by construction.
 */

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/* ─── Easing ─────────────────────────────────────────────────────────── */

// Named easings map to the same control points CSS uses, so editor preview
// (which could use CSS transitions) and the headless evaluator agree.
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

export function evalEasing(easing: StageEasing | undefined, t: number): number {
  const x = clamp01(t)
  if (!easing || easing === 'linear') return x
  if (typeof easing === 'object') return cubicBezier(easing.cubicBezier, x)
  return cubicBezier(NAMED_BEZIER[easing] ?? NAMED_BEZIER.easeInOut, x)
}

/* ─── Enter / exit edge poses ────────────────────────────────────────── */

/** Off-canvas travel (percentage points of the card) for a slide ramp. */
const SLIDE_OFFSET_PCT = 60
/** Starting scale multiple for a scale-in ramp. */
const SCALE_FROM = 0.8

/** The "from" pose at the head of an enter ramp (interpolated toward settled). */
function enterFromTransform(settled: TransformLike, anim: EnterExitAnim): TransformLike {
  return edgePose(settled, anim)
}

/** The "to" pose at the tail of an exit ramp (interpolated from settled). */
function exitToTransform(settled: TransformLike, anim: EnterExitAnim): TransformLike {
  return edgePose(settled, anim)
}

/** Shared edge-pose builder: applies the animation family to the settled pose. */
function edgePose(settled: TransformLike, anim: EnterExitAnim): TransformLike {
  switch (anim.kind) {
    case 'fade':
      return { ...settled, opacity: 0 }
    case 'scale':
      return { ...settled, scale: settled.scale * SCALE_FROM, opacity: 0 }
    case 'slide': {
      const d = anim.direction ?? 'left'
      const dx = d === 'left' ? -SLIDE_OFFSET_PCT : d === 'right' ? SLIDE_OFFSET_PCT : 0
      const dy = d === 'up' ? -SLIDE_OFFSET_PCT : d === 'down' ? SLIDE_OFFSET_PCT : 0
      return { ...settled, xPct: settled.xPct + dx, yPct: settled.yPct + dy }
    }
    case 'none':
    default:
      return settled
  }
}

function lerpTransform(a: TransformLike, b: TransformLike, t: number): TransformLike {
  return {
    // Size channels hold the settled box (animation rides scale/opacity/position).
    widthPct: b.widthPct,
    heightPct: b.heightPct,
    xPct: lerp(a.xPct, b.xPct, t),
    yPct: lerp(a.yPct, b.yPct, t),
    scale: lerp(a.scale, b.scale, t),
    rotation: lerp(a.rotation, b.rotation, t),
    opacity: lerp(a.opacity, b.opacity, t),
  }
}

/* ─── Public sampler ─────────────────────────────────────────────────── */

export interface ResolvedClipFrame {
  transform: TransformLike
  /** Source-media time (ms) the clip should display at this playhead. */
  sourceTimeMs: number
}

/**
 * Resolve a clip's effective transform + source time at `playheadMs`, or `null`
 * if the clip is not live (outside `[startMs, startMs+durationMs)`).
 */
export function resolveClipFrame(clip: VideoClip, playheadMs: number): ResolvedClipFrame | null {
  const start = clip.startMs
  const end = clip.startMs + clip.durationMs
  if (playheadMs < start || playheadMs >= end) return null

  const local = playheadMs - start
  const settled = clip.transform
  const enterDur = clip.enterAnim.kind === 'none' ? 0 : Math.min(clip.enterAnim.durationMs, clip.durationMs)
  const exitDur = clip.exitAnim.kind === 'none' ? 0 : Math.min(clip.exitAnim.durationMs, clip.durationMs)
  const exitStart = clip.durationMs - exitDur

  let transform = settled
  if (enterDur > 0 && local < enterDur) {
    const t = evalEasing(clip.enterAnim.easing, local / enterDur)
    transform = lerpTransform(enterFromTransform(settled, clip.enterAnim), settled, t)
  } else if (exitDur > 0 && local >= exitStart) {
    const t = evalEasing(clip.exitAnim.easing, (local - exitStart) / exitDur)
    transform = lerpTransform(settled, exitToTransform(settled, clip.exitAnim), t)
  }

  const sourceIn = clip.sourceInMs ?? 0
  return { transform, sourceTimeMs: sourceIn + local }
}
