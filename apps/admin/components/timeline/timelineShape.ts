import { resolveBeatIndex } from '@vismay/viz-engine'
import type { ResolvedUnit, StageConfig, StageEntity, StageKeyframe } from '@vismay/viz-engine'

/** Beats-axis grid metrics — shared by `BeatTimeline` and `EntityRow` (kept
 * here rather than in either component to avoid a cross-import cycle). */
export const BEAT_COL_W = 160
export const ROW_H = 36
export const HEADER_H = 40

/** One column of the beats-axis timeline — one per `ResolvedUnit`. */
export interface TimelineColumn {
  unit: number
  parentIndex: number
  subIndex: number
  /** Section id if authored, else `section-<parentIndex>` (matches the canvas-frame id convention). */
  sectionId: string
  heading: string | undefined
  clock: 'triggered' | 'scrubbed'
  runway: number | undefined
  timelineMs: number | undefined
  /** True for the first unit of a new parent section — where a boundary transition chip belongs. */
  isSectionStart: boolean
}

/**
 * Beats-axis columns for the stage timeline panel — one per resolved unit,
 * server-loaded the same way `CanvasPage`/`loadStoryEditorData` do via
 * `resolveUnits`. Carries just the per-section fields the timeline UI needs
 * for headers and boundary chips; the full `StorySectionConfig` stays on the
 * server (nothing here needs it beyond these fields).
 */
export function buildTimelineColumns(units: ResolvedUnit[]): TimelineColumn[] {
  return units.map((u, i) => ({
    unit: i,
    parentIndex: u.parentIndex,
    subIndex: u.subIndex,
    sectionId: u.parentConfig.id ?? `section-${u.parentIndex}`,
    heading: u.heading,
    clock: u.parentConfig.clock === 'scrubbed' ? 'scrubbed' : 'triggered',
    runway: u.parentConfig.runway,
    timelineMs: u.parentConfig.timelineMs,
    isSectionStart: i === 0 || units[i - 1].parentIndex !== u.parentIndex,
  }))
}

/** entityId -> beatIndex -> the raw authored keyframe(s) landing on that beat. */
export type AuthoredKeyframeIndex = Record<string, Record<number, StageKeyframe[]>>

/**
 * Precompute which beat each authored keyframe resolves to, server-side —
 * the client-side timeline then does a plain object lookup instead of
 * re-running `resolveBeatIndex` (which needs the full `ResolvedUnit[]`,
 * including its markdown paragraphs, that the client has no other reason to
 * hold). Beats with no authored keyframe are simply absent from the inner
 * map — the timeline shows those as pure cross-beat interpolation.
 */
export function buildAuthoredKeyframeIndex(
  stage: StageConfig | undefined,
  units: ResolvedUnit[]
): AuthoredKeyframeIndex {
  const index: AuthoredKeyframeIndex = {}
  for (const entity of stage?.entities ?? []) {
    const byBeat: Record<number, StageKeyframe[]> = {}
    for (const kf of entity.keyframes) {
      const beat = resolveBeatIndex(units, kf.at)
      if (beat < 0) continue
      ;(byBeat[beat] ??= []).push(kf)
    }
    index[entity.id] = byBeat
  }
  return index
}

/** Convenience: the raw `StageEntity` by id, for the inspector's entity-level fields. */
export function findEntity(stage: StageConfig | undefined, entityId: string): StageEntity | undefined {
  return stage?.entities.find((e) => e.id === entityId)
}

/** One row's resolved beat span, for the timeline's lifetime bar. */
export interface EntityLifetime {
  id: string
  role: 'subject' | 'object'
  /** Inclusive beat range the entity is present for. */
  enterBeat: number
  exitBeat: number
}

/**
 * Resolve each entity's lifetime to a beat range, server-side — mirrors
 * `resolveStage.ts`'s own `lo`/`hi` derivation (explicit `enter`/`exit` else
 * the first/last resolvable keyframe) without running the full densifier
 * (which needs `isPortrait` + produces per-unit segment/transform data the
 * timeline grid doesn't need). Entities with no resolvable keyframe are
 * omitted, matching `resolveStage`'s own skip-and-warn behavior.
 */
export function buildEntityLifetimes(
  stage: StageConfig | undefined,
  units: ResolvedUnit[]
): EntityLifetime[] {
  const out: EntityLifetime[] = []
  for (const entity of stage?.entities ?? []) {
    const beats = entity.keyframes
      .map((kf) => resolveBeatIndex(units, kf.at))
      .filter((b) => b >= 0)
      .sort((a, b) => a - b)
    if (beats.length === 0) continue
    const enterIdx = entity.enter != null ? resolveBeatIndex(units, entity.enter) : -1
    const exitIdx = entity.exit != null ? resolveBeatIndex(units, entity.exit) : -1
    out.push({
      id: entity.id,
      role: entity.role,
      enterBeat: enterIdx >= 0 ? enterIdx : beats[0],
      exitBeat: exitIdx >= 0 ? exitIdx : beats[beats.length - 1],
    })
  }
  return out
}
