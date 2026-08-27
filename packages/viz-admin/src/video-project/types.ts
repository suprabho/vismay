import type { VizLayer } from '@vismay/viz-engine'
import type { StageEasing } from '@vismay/viz-engine'
import type { TransformLike } from '../composer/transform'
import type { LayerBox } from '../composer/box'

/**
 * The freeform video-editor data model.
 *
 * A *project* is a self-contained JSON snapshot — clips placed on tracks with
 * spatial transforms + timeline timing + entry/exit animations — that both the
 * admin editor and the headless render surface consume. It's persisted opaquely
 * (one `video_projects` row, `config jsonb`), mirroring `vizmaya_share_cards`.
 *
 * It deliberately reuses the composer's spatial vocabulary (`TransformLike`,
 * `LayerBox`) so a clip's on-canvas placement round-trips through the existing
 * `LayerComposer` / `FreeTransformLayer` machinery unchanged, and a clip's
 * *what-renders* is a plain `VizLayer` so any registered viz module (video,
 * image, text, …) works as a clip body with zero new rendering code.
 */

/** Output aspect — shares the render pipeline's `VideoAspect` vocabulary. */
export type VideoProjectAspect = '9:16' | '16:9'

/** How a clip animates in at its head / out at its tail. */
export interface EnterExitAnim {
  /** Animation family. `none` = hard cut (clip pops at full transform). */
  kind: 'none' | 'fade' | 'slide' | 'scale'
  /** Ramp length in ms at the clip edge. */
  durationMs: number
  /** Slide direction (slide only) — the side the clip travels from/to. */
  direction?: 'left' | 'right' | 'up' | 'down'
  /** Easing for the ramp (reuses the stage easing vocabulary). */
  easing?: StageEasing
}

export const DEFAULT_ENTER_ANIM: EnterExitAnim = {
  kind: 'fade',
  durationMs: 400,
  easing: 'easeOut',
}

export const DEFAULT_EXIT_ANIM: EnterExitAnim = {
  kind: 'fade',
  durationMs: 400,
  easing: 'easeIn',
}

/**
 * Editor-level classification of a clip. Drives sensible defaults (e.g. a
 * `text` clip seeds a text layer) and the timeline's row affinity; it does NOT
 * change how the clip renders — that's entirely `layer.type`.
 *
 *  - `media`   — an uploaded video clip (`layer.type === 'video'`).
 *  - `text`    — a text overlay (`layer.type === 'text'`).
 *  - `object`  — ambient decor (image/sticker), mirrors a stage 'object'.
 *  - `subject` — a foreground focal element, mirrors a stage 'subject'.
 *  - `audio`   — an audio-only clip (`layer.type === 'audio'`); never drawn.
 */
export type ClipRole = 'media' | 'text' | 'object' | 'subject' | 'audio'

export interface VideoClip {
  id: string
  trackId: string
  /** The engine layer rendered through the viz-engine registry (the "what"). */
  layer: VizLayer
  role: ClipRole
  /** Timeline start, ms from project t=0. */
  startMs: number
  /** On-timeline lifetime, ms. The clip is live over `[startMs, startMs+durationMs)`. */
  durationMs: number
  /** Trim window into the source media (video/audio clips). Default 0. */
  sourceInMs?: number
  /** Trim out-point into the source media. Default = `sourceInMs + durationMs`. */
  sourceOutMs?: number
  /** Settled on-canvas placement (center % + size + rotation + opacity). */
  transform: TransformLike
  /** Optional panel chrome drawn behind the clip's content. */
  box?: LayerBox
  enterAnim: EnterExitAnim
  exitAnim: EnterExitAnim
  visible: boolean
  /** Audio-track clips: per-clip mute (independent of the track mute). */
  muted?: boolean
}

export interface VideoTrack {
  id: string
  name: string
  /** `visual` tracks draw on the canvas; `audio` tracks only contribute sound. */
  kind: 'visual' | 'audio'
  /** Row order. Higher index renders on top (visual) / lists lower (audio). */
  index: number
  /** Audio tracks: mute the whole track. */
  muted?: boolean
}

export interface VideoProjectSnapshot {
  version: 1
  aspect: VideoProjectAspect
  /** Single background layer drawn behind every clip (or none). */
  background: VizLayer | null
  tracks: VideoTrack[]
  clips: VideoClip[]
  /** Project length in ms. Authoritative for the render clock. */
  durationMs: number
}

/** A fresh, empty project at the given aspect. */
export function emptyProjectSnapshot(
  aspect: VideoProjectAspect = '16:9',
): VideoProjectSnapshot {
  return {
    version: 1,
    aspect,
    background: null,
    tracks: [
      { id: 'track-visual-1', name: 'Video 1', kind: 'visual', index: 1 },
      { id: 'track-audio-1', name: 'Audio 1', kind: 'audio', index: 0 },
    ],
    clips: [],
    durationMs: 10_000,
  }
}

/** Project px size per aspect — matches the render pipeline's output sizes. */
export const PROJECT_OUTPUT_SIZE: Record<
  VideoProjectAspect,
  { w: number; h: number }
> = {
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
}

/** The end (ms) of the latest clip — the natural project duration. */
export function clipsEndMs(clips: VideoClip[]): number {
  return clips.reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0)
}
