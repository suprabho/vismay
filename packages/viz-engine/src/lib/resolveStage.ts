import type {
  ResolvedUnit,
  StageConfig,
  StageEntity,
  StageTransform,
  StageEasing,
  BeatSelector,
  ResolvedStage,
  ResolvedStageEntity,
  ResolvedStageFrame,
} from './storyConfig.types'

/**
 * Densify a story's Tier-1 stage config into per-unit frames.
 *
 * Mirrors the map module's persistent-aggregated pattern: sparse, beat-keyed
 * transform keyframes become one settled transform PER unit (index-aligned
 * with the active `units` array), interpolating between bracketing keyframes
 * and holding at the ends. The renderer then just reads `frames[activeUnit]`
 * and tweens (live) or snaps (capture) to it — beat→beat smoothing is a CSS
 * transition, so this resolver does plain linear sampling; the per-segment
 * `easing` rides on each frame for the renderer's transition-timing-function.
 *
 * Beat selectors resolve against `units` (by section id / index + subIndex) so
 * tracks survive content edits, exactly like the (parentIndex, subIndex)
 * identity `lib/storyTts.ts` uses. Pure — no content or DOM access.
 */

const DEFAULT_EASING: StageEasing = 'easeInOut'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Resolve a beat selector to a flat unit index, or -1 if it can't be found. */
export function resolveBeatIndex(
  units: ResolvedUnit[],
  beat: BeatSelector | number
): number {
  if (typeof beat === 'number') {
    // Bare number = flat unit index (escape hatch).
    if (beat < 0 || beat >= units.length) return -1
    return beat
  }
  const sub = beat.sub ?? 0
  if (typeof beat.section === 'number') {
    return units.findIndex(
      (u) => u.parentIndex === beat.section && u.subIndex === sub
    )
  }
  return units.findIndex(
    (u) => u.parentConfig.id === beat.section && u.subIndex === sub
  )
}

/** Apply Tier-1 defaults so a resolved transform has no undefined live fields. */
function withDefaults(t: StageTransform): StageTransform {
  return {
    position: { x: t.position?.x ?? 0, y: t.position?.y ?? 0 },
    scale: t.scale ?? 1,
    opacity: t.opacity ?? 1,
    rotation: t.rotation ?? 0,
    zBand: t.zBand ?? 'mid',
    zIndex: t.zIndex ?? 0,
    // Reserved 3D fields carried through verbatim (flat renderer ignores them;
    // Tier 2 will interpolate them properly).
    ...(t.position3d ? { position3d: t.position3d } : {}),
    ...(t.quaternion ? { quaternion: t.quaternion } : {}),
    ...(t.rotation3d ? { rotation3d: t.rotation3d } : {}),
    ...(t.camera ? { camera: t.camera } : {}),
  }
}

/** Per-channel linear interpolation of the Tier-1 fields between two keyframes. */
export function interpolateTransform(
  a: StageTransform,
  b: StageTransform,
  t: number
): StageTransform {
  return {
    position: {
      x: lerp(a.position?.x ?? 0, b.position?.x ?? 0, t),
      y: lerp(a.position?.y ?? 0, b.position?.y ?? 0, t),
    },
    scale: lerp(a.scale ?? 1, b.scale ?? 1, t),
    opacity: lerp(a.opacity ?? 1, b.opacity ?? 1, t),
    rotation: lerp(a.rotation ?? 0, b.rotation ?? 0, t),
    // Discrete fields hold the source keyframe's value until the next keyframe.
    zBand: a.zBand ?? b.zBand ?? 'mid',
    zIndex: a.zIndex ?? 0,
    ...(a.position3d ? { position3d: a.position3d } : {}),
    ...(a.quaternion ? { quaternion: a.quaternion } : {}),
    ...(a.rotation3d ? { rotation3d: a.rotation3d } : {}),
    ...(a.camera ? { camera: a.camera } : {}),
  }
}

interface ResolvedKeyframe {
  idx: number
  transform: StageTransform
  easing: StageEasing
}

/**
 * Sample an entity's (sorted) keyframes at flat unit index `i`:
 *  - exact keyframe → that transform
 *  - before first / after last → hold the nearest keyframe
 *  - between two → linear interpolate, carrying the source keyframe's easing
 */
export function sampleTrack(
  resolved: ResolvedKeyframe[],
  i: number
): { transform: StageTransform; easing: StageEasing } {
  const exact = resolved.find((k) => k.idx === i)
  if (exact) return { transform: withDefaults(exact.transform), easing: exact.easing }

  const first = resolved[0]
  const last = resolved[resolved.length - 1]
  if (i < first.idx) return { transform: withDefaults(first.transform), easing: first.easing }
  if (i > last.idx) return { transform: withDefaults(last.transform), easing: last.easing }

  let lo = first
  let hi = last
  for (let k = 0; k < resolved.length - 1; k++) {
    if (resolved[k].idx < i && i < resolved[k + 1].idx) {
      lo = resolved[k]
      hi = resolved[k + 1]
      break
    }
  }
  const t = (i - lo.idx) / (hi.idx - lo.idx)
  return { transform: interpolateTransform(lo.transform, hi.transform, t), easing: lo.easing }
}

const ABSENT_FRAME: ResolvedStageFrame = {
  present: false,
  transform: withDefaults({}),
  easing: 'linear',
}

function resolveEntity(
  units: ResolvedUnit[],
  entity: StageEntity,
  opts: { isPortrait: boolean }
): ResolvedStageEntity | null {
  // Portrait degrade: objects hide by default, subjects keep (overridable).
  const portraitHidden = entity.portrait?.hidden ?? entity.role === 'object'
  if (opts.isPortrait && portraitHidden) return null

  const resolved: ResolvedKeyframe[] = entity.keyframes
    .map((kf) => ({
      idx: resolveBeatIndex(units, kf.at),
      transform: kf.transform,
      easing: kf.easing ?? DEFAULT_EASING,
    }))
    .filter((k) => k.idx >= 0)
    .sort((a, b) => a.idx - b.idx)

  if (resolved.length === 0) {
    console.warn(
      `[stage] entity '${entity.id}' has no resolvable keyframes — skipping`
    )
    return null
  }

  const enterIdx = entity.enter != null ? resolveBeatIndex(units, entity.enter) : -1
  const exitIdx = entity.exit != null ? resolveBeatIndex(units, entity.exit) : -1
  const lo = enterIdx >= 0 ? enterIdx : resolved[0].idx
  const hi = exitIdx >= 0 ? exitIdx : resolved[resolved.length - 1].idx

  const interactive = entity.role === 'subject' ? entity.interactive ?? true : false
  const zFocusCapable = entity.role === 'subject' ? entity.zFocusCapable ?? false : false

  const frames: ResolvedStageFrame[] = []
  for (let i = 0; i < units.length; i++) {
    if (i < lo || i > hi) {
      frames.push(ABSENT_FRAME)
      continue
    }
    const { transform, easing } = sampleTrack(resolved, i)
    frames.push({ present: true, transform, easing })
  }

  // Lifetime-edge pre-roll / post-roll poses: render one mounted frame just
  // before enter (in `enterTransform`) and just after exit (in `exitTransform`)
  // so the entity animates in/out instead of popping.
  if (entity.enterTransform && lo - 1 >= 0) {
    frames[lo - 1] = {
      present: true,
      transform: withDefaults(entity.enterTransform),
      easing: resolved[0].easing,
    }
  }
  if (entity.exitTransform && hi + 1 < units.length) {
    frames[hi + 1] = {
      present: true,
      transform: withDefaults(entity.exitTransform),
      easing: resolved[resolved.length - 1].easing,
    }
  }

  return { id: entity.id, role: entity.role, content: entity.content, interactive, zFocusCapable, frames }
}

/**
 * Resolve a story's stage config into per-unit frames for the renderer.
 * Returns an empty stage when no entities are configured.
 */
export function resolveStage(
  units: ResolvedUnit[],
  stage: StageConfig | undefined,
  opts: { isPortrait: boolean }
): ResolvedStage {
  if (!stage?.entities?.length || units.length === 0) return { entities: [] }
  const entities = stage.entities
    .map((e) => resolveEntity(units, e, opts))
    .filter((e): e is ResolvedStageEntity => e !== null)
  return { entities }
}
