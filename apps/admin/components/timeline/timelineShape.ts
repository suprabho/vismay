import type {
  BeatSelector,
  ResolvedUnit,
  StageConfig,
  StageEntity,
  StageKeyframe,
  StageKeyframeAt,
} from '@vismay/viz-engine'

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
  /**
   * `parentConfig.id` verbatim — undefined when the section has no authored
   * id. Kept separate from `sectionId` because the fallback `section-N` form
   * is display-only: written into a beat selector it would NOT resolve
   * (`resolveBeatIndex` matches authored ids or numeric indices only).
   */
  authoredSectionId?: string
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
 * for headers, boundary chips, and (E2) client-side beat resolution; the full
 * `StorySectionConfig` stays on the server.
 */
export function buildTimelineColumns(units: ResolvedUnit[]): TimelineColumn[] {
  return units.map((u, i) => ({
    unit: i,
    parentIndex: u.parentIndex,
    subIndex: u.subIndex,
    sectionId: u.parentConfig.id ?? `section-${u.parentIndex}`,
    authoredSectionId: u.parentConfig.id,
    heading: u.heading,
    clock: u.parentConfig.clock === 'scrubbed' ? 'scrubbed' : 'triggered',
    runway: u.parentConfig.runway,
    timelineMs: u.parentConfig.timelineMs,
    isSectionStart: i === 0 || units[i - 1].parentIndex !== u.parentIndex,
  }))
}

/**
 * Client-side mirror of the engine's `resolveBeatIndex` (resolveStage.ts) —
 * columns are 1:1 with units by construction, and carry exactly the fields
 * the resolver matches on, so the editor can re-resolve after local edits
 * without shipping the markdown-heavy `ResolvedUnit[]` to the client.
 */
export function beatIndexForSelector(
  columns: TimelineColumn[],
  at: BeatSelector | number
): number {
  if (typeof at === 'number') {
    if (at < 0 || at >= columns.length) return -1
    return at
  }
  const sub = at.sub ?? 0
  if (typeof at.section === 'number') {
    return columns.findIndex((c) => c.parentIndex === at.section && c.subIndex === sub)
  }
  return columns.findIndex((c) => c.authoredSectionId === at.section && c.subIndex === sub)
}

/**
 * Synthesize the `at` selector for a beat (for keyframes the editor moves) —
 * prefers the authored-id form so the track survives content edits, falling
 * back to the numeric `{section: parentIndex, sub}` form when the section has
 * no authored id. Never writes the display-only `section-N` fallback string.
 */
export function selectorForBeat(
  columns: TimelineColumn[],
  beat: number,
  t?: number
): StageKeyframeAt {
  const col = columns[beat]
  const base: StageKeyframeAt = col?.authoredSectionId
    ? { section: col.authoredSectionId }
    : { section: col?.parentIndex ?? beat }
  if (col && col.subIndex !== 0) base.sub = col.subIndex
  if (t !== undefined) base.t = t
  return base
}

/** One authored keyframe with its write-back identity in `entity.keyframes[]`. */
export interface AuthoredKf {
  kfIndex: number
  kf: StageKeyframe
}

/** entityId -> beatIndex -> the raw authored keyframe(s) landing on that beat. */
export type AuthoredKeyframeIndex = Record<string, Record<number, AuthoredKf[]>>

/**
 * Which beat each authored keyframe resolves to. Column-based so the client
 * can re-derive it after every local edit (E2) — a plain object lookup for
 * the grid, plus the keyframe's array index for inspector write-back. Beats
 * with no authored keyframe are simply absent from the inner map — the
 * timeline shows those as pure cross-beat interpolation.
 */
export function buildAuthoredKeyframeIndex(
  stage: StageConfig | null | undefined,
  columns: TimelineColumn[]
): AuthoredKeyframeIndex {
  const index: AuthoredKeyframeIndex = {}
  for (const entity of stage?.entities ?? []) {
    const byBeat: Record<number, AuthoredKf[]> = {}
    entity.keyframes.forEach((kf, kfIndex) => {
      const beat = beatIndexForSelector(columns, kf.at)
      if (beat < 0) return
      ;(byBeat[beat] ??= []).push({ kfIndex, kf })
    })
    index[entity.id] = byBeat
  }
  return index
}

/** Convenience: the raw `StageEntity` by id, for the inspector's entity-level fields. */
export function findEntity(stage: StageConfig | null | undefined, entityId: string): StageEntity | undefined {
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
 * Resolve each entity's lifetime to a beat range — mirrors `resolveStage.ts`'s
 * own `lo`/`hi` derivation (explicit `enter`/`exit` else the first/last
 * resolvable keyframe) without running the full densifier. Column-based for
 * the same client-side re-derivation reason as `buildAuthoredKeyframeIndex`.
 * Entities with no resolvable keyframe are omitted, matching `resolveStage`'s
 * own skip-and-warn behavior.
 */
export function buildEntityLifetimes(
  stage: StageConfig | null | undefined,
  columns: TimelineColumn[]
): EntityLifetime[] {
  const out: EntityLifetime[] = []
  for (const entity of stage?.entities ?? []) {
    const beats = entity.keyframes
      .map((kf) => beatIndexForSelector(columns, kf.at))
      .filter((b) => b >= 0)
      .sort((a, b) => a - b)
    if (beats.length === 0) continue
    const enterIdx = entity.enter != null ? beatIndexForSelector(columns, entity.enter) : -1
    const exitIdx = entity.exit != null ? beatIndexForSelector(columns, entity.exit) : -1
    out.push({
      id: entity.id,
      role: entity.role,
      enterBeat: enterIdx >= 0 ? enterIdx : beats[0],
      exitBeat: exitIdx >= 0 ? exitIdx : beats[beats.length - 1],
    })
  }
  return out
}
