import {
  clipsEndMs,
  resolveClipFrame,
  type ComposerLayer,
  type ComposerState,
  type VideoClip,
  type VideoProjectSnapshot,
} from '@vismay/viz-admin'

/**
 * The seam between the snapshot (single source of truth) and the composer shell.
 *
 *  - `projectToComposerState` PROJECTS (snapshot, playheadMs) → a `ComposerState`
 *    the `LayerComposer` renders. It samples each visual clip at the playhead via
 *    `resolveClipFrame`, so what you scrub is what the shell draws.
 *  - `applyComposerEditsToSnapshot` writes the shell's edits (config + settled
 *    transform) BACK into the snapshot, mapped by clip id.
 *
 * Audio-track clips are never visual — they're omitted from the composer state
 * entirely (the timeline panel manages them).
 */

/** Resolve a clip's owning track so we can z-order + skip audio tracks. */
function trackOf(snapshot: VideoProjectSnapshot, clip: VideoClip) {
  return snapshot.tracks.find((t) => t.id === clip.trackId)
}

/**
 * Is the playhead inside the clip's SETTLED window — i.e. not on an active
 * enter/exit ramp? Only then is the composer layer's transform the clip's real
 * settled transform, so only then is it safe to write a drag back verbatim.
 * (Mirrors the ramp math in `resolveClipFrame`.)
 */
export function isClipSettled(clip: VideoClip, playheadMs: number): boolean {
  const local = playheadMs - clip.startMs
  if (local < 0 || local >= clip.durationMs) return false
  const enterDur = clip.enterAnim.kind === 'none' ? 0 : Math.min(clip.enterAnim.durationMs, clip.durationMs)
  const exitDur = clip.exitAnim.kind === 'none' ? 0 : Math.min(clip.exitAnim.durationMs, clip.durationMs)
  const exitStart = clip.durationMs - exitDur
  return local >= enterDur && local < exitStart
}

/**
 * Project the snapshot to a `ComposerState` at `playheadMs`. Only LIVE visual
 * clips (resolveClipFrame !== null) become layers; z-order is track index then
 * clip order (later = on top), matching the render pipeline's draw order.
 */
export function projectToComposerState(
  snapshot: VideoProjectSnapshot,
  playheadMs: number,
): ComposerState {
  const layers: Array<{ z: number; order: number; layer: ComposerLayer }> = []
  snapshot.clips.forEach((clip, order) => {
    const track = trackOf(snapshot, clip)
    if (!track || track.kind !== 'visual') return
    const resolved = resolveClipFrame(clip, playheadMs)
    if (!resolved) return
    layers.push({
      z: track.index,
      order,
      layer: {
        id: clip.id,
        layer: clip.layer,
        name: clipName(clip),
        visible: clip.visible,
        transform: resolved.transform,
        box: clip.box,
      },
    })
  })
  layers.sort((a, b) => a.z - b.z || a.order - b.order)
  return {
    layers: layers.map((l) => l.layer),
    background: snapshot.background,
  }
}

/** A readable layer-list name for a clip. */
function clipName(clip: VideoClip): string {
  const t = clip.layer.type
  if (t === 'text') {
    const c = (clip.layer as { content?: unknown }).content
    const s = Array.isArray(c) ? c[0] : c
    if (typeof s === 'string' && s.trim()) return s.trim().slice(0, 24)
  }
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Write the composer's edits back into the snapshot, by clip id.
 *
 * IMPORTANT round-trip rule: the composer layer's `transform` is the RESOLVED
 * (animated) transform sampled at the current playhead. If the user dragged a
 * clip while it sits on an enter/exit RAMP, that resolved pose is offset from the
 * settled pose, so writing it back verbatim would corrupt the settled transform.
 * For MVP simplicity we therefore only write the transform back when the clip is
 * in its SETTLED window (no active ramp); otherwise we write the layer CONFIG
 * only and leave the settled transform untouched. The caller (VideoEditor) is
 * responsible for passing the same `playheadMs` the state was projected at.
 */
export function applyComposerEditsToSnapshot(
  snapshot: VideoProjectSnapshot,
  composerState: ComposerState,
  playheadMs: number,
): VideoProjectSnapshot {
  const byId = new Map(composerState.layers.map((l) => [l.id, l]))
  const clips = snapshot.clips.map((clip) => {
    const cl = byId.get(clip.id)
    if (!cl) return clip
    const settled = isClipSettled(clip, playheadMs)
    return {
      ...clip,
      layer: cl.layer,
      box: cl.box,
      // Only adopt the dragged transform when the clip is settled at this
      // playhead — otherwise the resolved pose carries the ramp offset.
      transform: settled && cl.transform ? cl.transform : clip.transform,
    }
  })
  return { ...snapshot, clips, background: composerState.background }
}

/** Append a clip and bump the project duration to cover it. */
export function addClipToSnapshot(
  snapshot: VideoProjectSnapshot,
  clip: VideoClip,
): VideoProjectSnapshot {
  const clips = [...snapshot.clips, clip]
  return {
    ...snapshot,
    clips,
    durationMs: Math.max(snapshot.durationMs, clipsEndMs(clips)),
  }
}

/** Patch a single clip by id (timing / anims / config), re-deriving duration. */
export function patchClip(
  snapshot: VideoProjectSnapshot,
  id: string,
  patch: Partial<VideoClip>,
): VideoProjectSnapshot {
  const clips = snapshot.clips.map((c) => (c.id === id ? { ...c, ...patch } : c))
  return {
    ...snapshot,
    clips,
    durationMs: Math.max(snapshot.durationMs, clipsEndMs(clips)),
  }
}

/** Remove a clip by id. */
export function removeClip(snapshot: VideoProjectSnapshot, id: string): VideoProjectSnapshot {
  return { ...snapshot, clips: snapshot.clips.filter((c) => c.id !== id) }
}
