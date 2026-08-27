import type {
  ResolvedUnit,
  StageConfig,
  StageEntity,
  StageKeyframe,
  StageTransform,
  StageEasing,
  BeatSelector,
  ResolvedStage,
  ResolvedStageEntity,
  ResolvedStageFrame,
  ResolvedStageSegment,
} from './storyConfig.types'
import { evalEasing } from './stageEasing'

/**
 * Densify a story's Tier-1 stage config into per-unit frames.
 *
 * Mirrors the map module's persistent-aggregated pattern: sparse, beat-keyed
 * transform keyframes become one settled transform PER unit (index-aligned
 * with the active `units` array), interpolating between bracketing keyframes
 * and holding at the ends. On top of the settled pose, each present frame
 * carries a compiled beat-local SEGMENT list (the slide timeline): sub-
 * keyframes (`at.t`) and per-keyframe `delayMs`/`durationMs` become
 * `{startMs, endMs, from, to, easing}` runs that the renderer's rAF clock
 * samples via `sampleBeat`. Beats authored the legacy way (one keyframe, no
 * timing) compile to a single `{0, 700, from: null, to: settled}` segment —
 * exactly the old global tween — and capture/reduced-motion snap straight to
 * `frames[activeUnit].transform`, so the settled contract is unchanged.
 *
 * Beat selectors resolve against `units` (by section id / index + subIndex) so
 * tracks survive content edits, exactly like the (parentIndex, subIndex)
 * identity `lib/storyTts.ts` uses. Pure — no content or DOM access.
 * See docs/stage-timeline-and-section-transitions.md.
 */

const DEFAULT_EASING: StageEasing = 'easeInOut'
/** Legacy single-tween length — the default segment duration everywhere. */
const DEFAULT_SEGMENT_MS = 700

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
  segments: [],
  timelineMs: 0,
}

/** One keyframe of a beat-local group. `t` is the EFFECTIVE beat-local time; `explicitT` records whether the author wrote it. */
interface BeatGroupMember {
  t: number
  explicitT: boolean
  transform: StageTransform
  easing: StageEasing
  delayMs?: number
  durationMs?: number
}

interface BeatGroup {
  idx: number
  /** Sorted by effective t; the last member is the beat's settled pose. */
  members: BeatGroupMember[]
}

/**
 * Group an entity's keyframes by resolved beat index and assign effective
 * beat-local times: a sole `t`-less keyframe is the settled pose (t = 1,
 * legacy semantics); a `t`-less member of a multi-keyframe group is the
 * beat's start pose (t = 0). Duplicates (same t, or a second `t`-less member)
 * were rejected at parse; here we drop them defensively with a warning.
 */
function groupKeyframes(units: ResolvedUnit[], entity: StageEntity): BeatGroup[] {
  const byIdx = new Map<number, Array<{ kf: StageKeyframe; t: number | null }>>()
  for (const kf of entity.keyframes) {
    const idx = resolveBeatIndex(units, kf.at)
    if (idx < 0) continue
    const t = typeof kf.at === 'object' && typeof kf.at.t === 'number' ? kf.at.t : null
    const list = byIdx.get(idx) ?? []
    list.push({ kf, t })
    byIdx.set(idx, list)
  }
  const groups: BeatGroup[] = []
  for (const [idx, list] of byIdx) {
    const members: BeatGroupMember[] = []
    const seenT = new Set<number>()
    let sawTless = false
    for (const { kf, t } of list) {
      const effective = t ?? (list.length === 1 ? 1 : 0)
      if (t == null && sawTless) {
        console.warn(`[stage] entity '${entity.id}': multiple t-less keyframes for one beat — dropping extras`)
        continue
      }
      if (t == null) sawTless = true
      if (seenT.has(effective)) {
        console.warn(`[stage] entity '${entity.id}': duplicate keyframe t=${effective} for one beat — dropping`)
        continue
      }
      seenT.add(effective)
      members.push({
        t: effective,
        explicitT: t != null,
        transform: kf.transform,
        easing: kf.easing ?? DEFAULT_EASING,
        delayMs: kf.delayMs,
        durationMs: kf.durationMs,
      })
    }
    members.sort((a, b) => a.t - b.t)
    if (members.length > 0) groups.push({ idx, members })
  }
  return groups.sort((a, b) => a.idx - b.idx)
}

/** One implicit legacy segment: tween into the settled pose over 700 ms. */
function implicitSegments(transform: StageTransform, easing: StageEasing): ResolvedStageSegment[] {
  return [{ startMs: 0, endMs: DEFAULT_SEGMENT_MS, from: null, to: transform, easing }]
}

/** Normalize a segment pose's discrete fields to the beat's settled values. */
function normalizeToSettled(pose: StageTransform, settled: StageTransform): StageTransform {
  return { ...pose, zBand: settled.zBand, zIndex: settled.zIndex }
}

/**
 * Compile a beat group into its segment list.
 *  - ms-mode (one keyframe, no `t`): `[delayMs, delayMs + durationMs]` into
 *    the settled pose, retargeting from the live pose (`from: null`).
 *  - t-mode: contiguous runs between sub-keyframe poses at `t * timelineMs`.
 *    A missing `t: 0` gets a prepended retarget run from the live pose; an
 *    authored `t: 0` is a hard start (zero-length segment — intentional cut).
 */
function compileSegments(
  group: BeatGroup,
  settled: StageTransform,
  sectionTimelineMs: number | undefined
): ResolvedStageSegment[] {
  const members = group.members
  const usesT = members.length > 1 || members.some((m) => m.explicitT)
  if (!usesT) {
    const sole = members[0]
    const start = sole.delayMs ?? 0
    return [{ startMs: start, endMs: start + (sole.durationMs ?? DEFAULT_SEGMENT_MS), from: null, to: settled, easing: sole.easing }]
  }
  const T = sectionTimelineMs ?? DEFAULT_SEGMENT_MS
  const poses = members.map((m) => normalizeToSettled(withDefaults(m.transform), settled))
  const segments: ResolvedStageSegment[] = []
  // First pose: hard start when authored at t:0, retarget run when not.
  segments.push({ startMs: 0, endMs: members[0].t * T, from: null, to: poses[0], easing: members[0].easing })
  for (let k = 1; k < members.length; k++) {
    segments.push({
      startMs: members[k - 1].t * T,
      endMs: members[k].t * T,
      from: poses[k - 1],
      to: poses[k],
      easing: members[k].easing,
    })
  }
  return segments
}

/**
 * Sample a beat-local pose at `tMs` (ms since beat entry). `entryPose` feeds
 * `from: null` segments — the entity's live pose captured at beat entry, so
 * interrupted tweens retarget continuously; null falls back to the segment's
 * own `to` (motionless — e.g. first mount). At/after `timelineMs` this
 * returns the frame's settled transform by identity, which is the literal
 * back-compat/capture guarantee.
 */
export function sampleBeat(
  frame: ResolvedStageFrame,
  tMs: number,
  entryPose: StageTransform | null
): StageTransform {
  if (!frame.present || frame.segments.length === 0) return frame.transform
  if (tMs >= frame.timelineMs) return frame.transform
  const segs = frame.segments
  let seg = segs[0]
  if (tMs < seg.startMs) return seg.from ?? entryPose ?? seg.to
  for (const s of segs) {
    if (s.startMs <= tMs) seg = s
    else break
  }
  if (tMs >= seg.endMs) return seg.to
  const from = seg.from ?? entryPose ?? seg.to
  const p = (tMs - seg.startMs) / (seg.endMs - seg.startMs)
  return interpolateTransform(from, seg.to, evalEasing(seg.easing, p))
}

function resolveEntity(
  units: ResolvedUnit[],
  entity: StageEntity,
  opts: { isPortrait: boolean }
): ResolvedStageEntity | null {
  // Portrait degrade: objects hide by default, subjects keep (overridable).
  const portraitHidden = entity.portrait?.hidden ?? entity.role === 'object'
  if (opts.isPortrait && portraitHidden) return null

  // Beat groups (sub-keyframes); the settled member of each group feeds the
  // cross-beat densifier below EXACTLY like a legacy keyframe, so settled
  // poses (and thus capture snaps and cross-beat interpolation) are unchanged.
  const groups = groupKeyframes(units, entity)
  const resolved: ResolvedKeyframe[] = groups.map((g) => {
    const settledMember = g.members[g.members.length - 1]
    return { idx: g.idx, transform: settledMember.transform, easing: settledMember.easing }
  })

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

  const groupByIdx = new Map(groups.map((g) => [g.idx, g]))
  const frames: ResolvedStageFrame[] = []
  for (let i = 0; i < units.length; i++) {
    if (i < lo || i > hi) {
      frames.push(ABSENT_FRAME)
      continue
    }
    const { transform, easing } = sampleTrack(resolved, i)
    const group = groupByIdx.get(i)
    const segments = group
      ? compileSegments(group, transform, units[i].parentConfig.timelineMs)
      : implicitSegments(transform, easing)
    const timelineMs = segments.reduce((m, s) => Math.max(m, s.endMs), 0)
    frames.push({ present: true, transform, easing, segments, timelineMs })
  }

  // Lifetime-edge pre-roll / post-roll poses: render one mounted frame just
  // before enter (in `enterTransform`) and just after exit (in `exitTransform`)
  // so the entity animates in/out instead of popping.
  if (entity.enterTransform && lo - 1 >= 0) {
    const transform = withDefaults(entity.enterTransform)
    frames[lo - 1] = {
      present: true,
      transform,
      easing: resolved[0].easing,
      segments: implicitSegments(transform, resolved[0].easing),
      timelineMs: DEFAULT_SEGMENT_MS,
    }
  }
  if (entity.exitTransform && hi + 1 < units.length) {
    const transform = withDefaults(entity.exitTransform)
    const easing = resolved[resolved.length - 1].easing
    frames[hi + 1] = {
      present: true,
      transform,
      easing,
      segments: implicitSegments(transform, easing),
      timelineMs: DEFAULT_SEGMENT_MS,
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
