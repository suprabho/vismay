import type {
  StageConfig,
  StageEasing,
  StageKeyframe,
  StageKeyframeAt,
  StageTransform,
} from '@vismay/viz-engine'
import {
  type AuthoredKeyframeIndex,
  type TimelineColumn,
  beatIndexForSelector,
  selectorForBeat,
} from './timelineShape'

/**
 * Pure mutation helpers for the E2 stage-timeline editor — every function is
 * `(stage, …) → new StageConfig` with structural sharing elsewhere, matching
 * the freeform video editor's `patchClip` model (projectToComposerState.ts).
 * validateStage's per-beat rules are enforced here by construction (atomic
 * mode switches, collision checks) so the UI can never author an invalid
 * keyframe.
 */

/** Write-back identity of one keyframe: entity id + index into `keyframes[]`. */
export interface KeyframeAddress {
  entityId: string
  kfIndex: number
}

/** Engine Tier-1 defaults — mirrors `resolveStage.ts`'s `withDefaults`. */
export const TRANSFORM_DEFAULTS = {
  x: 0,
  y: 0,
  scale: 1,
  opacity: 1,
  rotation: 0,
  zBand: 'mid' as const,
  zIndex: 0,
}

/** Flat editing view of a StageTransform (position unpacked). */
export interface FlatTransform {
  x: number
  y: number
  scale: number
  opacity: number
  rotation: number
  zBand: 'behind' | 'mid' | 'front'
  zIndex: number
}

export type TransformPatch = Partial<FlatTransform>

export function getKeyframe(stage: StageConfig, addr: KeyframeAddress): StageKeyframe | undefined {
  return stage.entities.find((e) => e.id === addr.entityId)?.keyframes[addr.kfIndex]
}

/** The defaults-applied flat view the transform controls render. */
export function flattenTransform(t: StageTransform | undefined): FlatTransform {
  return {
    x: t?.position?.x ?? TRANSFORM_DEFAULTS.x,
    y: t?.position?.y ?? TRANSFORM_DEFAULTS.y,
    scale: t?.scale ?? TRANSFORM_DEFAULTS.scale,
    opacity: t?.opacity ?? TRANSFORM_DEFAULTS.opacity,
    rotation: t?.rotation ?? TRANSFORM_DEFAULTS.rotation,
    zBand: t?.zBand ?? TRANSFORM_DEFAULTS.zBand,
    zIndex: t?.zIndex ?? TRANSFORM_DEFAULTS.zIndex,
  }
}

function replaceKeyframe(
  stage: StageConfig,
  addr: KeyframeAddress,
  next: StageKeyframe
): StageConfig {
  return {
    ...stage,
    entities: stage.entities.map((e) =>
      e.id === addr.entityId
        ? { ...e, keyframes: e.keyframes.map((kf, i) => (i === addr.kfIndex ? next : kf)) }
        : e
    ),
  }
}

/**
 * Apply a transform patch, pruning fields back out of the written YAML when
 * they are BOTH absent in the baseline (as-loaded) keyframe AND equal to the
 * engine default — so edits never bloat the config, while fields the author
 * explicitly wrote (even at default value, e.g. `rotation: 0`) survive.
 * `position` is `{x, y}`-atomic in the schema, so it prunes only when the
 * baseline lacked it and both axes are at default.
 */
export function patchTransform(
  stage: StageConfig,
  addr: KeyframeAddress,
  patch: TransformPatch,
  baselineKf: StageKeyframe | undefined
): StageConfig {
  const kf = getKeyframe(stage, addr)
  if (!kf) return stage
  const flat = { ...flattenTransform(kf.transform), ...patch }
  flat.opacity = Math.max(0, Math.min(1, flat.opacity))

  const base = baselineKf?.transform
  const next: StageTransform = {}
  const keepPosition =
    base?.position !== undefined || flat.x !== TRANSFORM_DEFAULTS.x || flat.y !== TRANSFORM_DEFAULTS.y
  if (keepPosition) next.position = { x: flat.x, y: flat.y }
  if (base?.scale !== undefined || flat.scale !== TRANSFORM_DEFAULTS.scale) next.scale = flat.scale
  if (base?.opacity !== undefined || flat.opacity !== TRANSFORM_DEFAULTS.opacity)
    next.opacity = flat.opacity
  if (base?.rotation !== undefined || flat.rotation !== TRANSFORM_DEFAULTS.rotation)
    next.rotation = flat.rotation
  if (base?.zBand !== undefined || flat.zBand !== TRANSFORM_DEFAULTS.zBand) next.zBand = flat.zBand
  if (base?.zIndex !== undefined || flat.zIndex !== TRANSFORM_DEFAULTS.zIndex)
    next.zIndex = flat.zIndex

  // Reserved Tier-2/3 fields the editor doesn't touch ride through untouched.
  const { position3d, quaternion, rotation3d, camera } = kf.transform
  if (position3d) next.position3d = position3d
  if (quaternion) next.quaternion = quaternion
  if (rotation3d) next.rotation3d = rotation3d
  if (camera) next.camera = camera

  return replaceKeyframe(stage, addr, { ...kf, transform: next })
}

/**
 * Set the keyframe's beat-local `t` (clamped 0..1). Atomically strips
 * `delayMs`/`durationMs` (mutually exclusive with `t`) and normalizes a
 * bare-number `at` into selector form. Returns `null` when the new `t`
 * collides with a sibling keyframe's `t` on the same beat (validateStage's
 * no-duplicate-t rule) — the caller keeps the old value.
 */
export function setKeyframeT(
  stage: StageConfig,
  addr: KeyframeAddress,
  t: number,
  columns: TimelineColumn[]
): StageConfig | null {
  const kf = getKeyframe(stage, addr)
  if (!kf) return stage
  const clamped = Math.max(0, Math.min(1, t))
  const beat = beatIndexForSelector(columns, kf.at)
  const entity = stage.entities.find((e) => e.id === addr.entityId)
  const collision = entity?.keyframes.some(
    (sibling, i) =>
      i !== addr.kfIndex &&
      beatIndexForSelector(columns, sibling.at) === beat &&
      typeof sibling.at === 'object' &&
      sibling.at.t === clamped
  )
  if (collision) return null
  const at: StageKeyframeAt =
    typeof kf.at === 'object' ? { ...kf.at, t: clamped } : selectorForBeat(columns, beat, clamped)
  const next: StageKeyframe = { ...kf, at }
  delete next.delayMs
  delete next.durationMs
  return replaceKeyframe(stage, addr, next)
}

/**
 * Switch the keyframe to ms-mode: strips `at.t`, sets clamped
 * `delayMs`/`durationMs`. Callers gate on `canUseMsTiming` (ms timing is only
 * valid on a beat's sole keyframe), so no collision check is needed here.
 */
export function setKeyframeTiming(
  stage: StageConfig,
  addr: KeyframeAddress,
  timing: { delayMs: number; durationMs: number }
): StageConfig {
  const kf = getKeyframe(stage, addr)
  if (!kf) return stage
  let at = kf.at
  if (typeof at === 'object' && at.t !== undefined) {
    at = { ...at }
    delete at.t
  }
  return replaceKeyframe(stage, addr, {
    ...kf,
    at,
    delayMs: Math.max(0, timing.delayMs),
    durationMs: Math.max(0, timing.durationMs),
  })
}

/**
 * Switch back to t-mode: strips `delayMs`/`durationMs`; `seedT` optionally
 * sets an explicit `at.t` (omit for the legacy settled-pose semantics).
 */
export function clearKeyframeTiming(
  stage: StageConfig,
  addr: KeyframeAddress,
  seedT?: number
): StageConfig {
  const kf = getKeyframe(stage, addr)
  if (!kf) return stage
  const next: StageKeyframe = { ...kf }
  delete next.delayMs
  delete next.durationMs
  if (seedT !== undefined && typeof next.at === 'object') {
    next.at = { ...next.at, t: Math.max(0, Math.min(1, seedT)) }
  }
  return replaceKeyframe(stage, addr, next)
}

/** Named easings only — the UI never calls this for `{cubicBezier}` keyframes. */
export function setKeyframeEasing(
  stage: StageConfig,
  addr: KeyframeAddress,
  easing: StageEasing | undefined
): StageConfig {
  const kf = getKeyframe(stage, addr)
  if (!kf) return stage
  const next: StageKeyframe = { ...kf }
  if (easing === undefined) delete next.easing
  else next.easing = easing
  return replaceKeyframe(stage, addr, next)
}

/** validateStage's rule precomputed for the UI: ms timing only on a beat's sole keyframe. */
export function canUseMsTiming(
  index: AuthoredKeyframeIndex,
  entityId: string,
  beat: number
): boolean {
  return (index[entityId]?.[beat]?.length ?? 0) === 1
}

/**
 * Drag-drop legality. E2 moves a beat's WHOLE keyframe group, so the rule
 * collapses to: target ≠ source and the target beat holds no authored
 * keyframes for this entity — a previously-valid group stays valid on an
 * empty beat (one t-less max, no duplicate t, delay/duration-on-sole all
 * hold by construction).
 */
export function canDropKeyframes(
  index: AuthoredKeyframeIndex,
  entityId: string,
  fromBeat: number,
  toBeat: number
): boolean {
  if (toBeat === fromBeat) return false
  return (index[entityId]?.[toBeat]?.length ?? 0) === 0
}

/**
 * Move every keyframe on `fromBeat` to `toBeat`: each keyframe's `at` is
 * rewritten via `selectorForBeat` (preserving its beat-local `t`); ms-mode
 * timing rides along untouched. Bare-number `at`s normalize to selector form.
 */
export function moveBeatKeyframes(
  stage: StageConfig,
  columns: TimelineColumn[],
  entityId: string,
  fromBeat: number,
  toBeat: number
): StageConfig {
  return {
    ...stage,
    entities: stage.entities.map((e) => {
      if (e.id !== entityId) return e
      return {
        ...e,
        keyframes: e.keyframes.map((kf) => {
          if (beatIndexForSelector(columns, kf.at) !== fromBeat) return kf
          const t = typeof kf.at === 'object' ? kf.at.t : undefined
          return { ...kf, at: selectorForBeat(columns, toBeat, t) }
        }),
      }
    }),
  }
}
