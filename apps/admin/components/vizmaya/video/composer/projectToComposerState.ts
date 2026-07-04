import {
  clipsEndMs,
  DEFAULT_TRANSFORM,
  resolveClipFrame,
  type ClipRole,
  type ComposerLayer,
  type ComposerState,
  type TransformLike,
  type VideoClip,
  type VideoProjectSnapshot,
} from '@vismay/viz-admin'

/** Default on-timeline length (ms) for a clip created from the editor. */
export const DEFAULT_CLIP_MS = 3000

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

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Fold an edited composer transform back into a clip's SETTLED transform.
 *
 * The composer layer's transform is the RESOLVED (animated) pose sampled at the
 * playhead — on an enter/exit ramp it's offset from the settled pose, so adopting
 * it verbatim would bake the ramp offset in. Instead we re-resolve the clip's
 * pre-edit pose at the same playhead and apply the DELTA between it and the
 * edited pose to the settled transform: additive for position/rotation/opacity,
 * multiplicative for scale (ramps scale multiplicatively), verbatim for the box
 * size channels (ramps never touch them). In the settled window resolved ==
 * settled, so this degenerates to adopting the edit verbatim; on a ramp the
 * offsets commute through the ramp lerp, so the on-canvas box tracks the pointer.
 */
function mergeEditedTransform(
  clip: VideoClip,
  edited: TransformLike | undefined,
  playheadMs: number,
): TransformLike {
  if (!edited) return clip.transform
  const resolved = resolveClipFrame(clip, playheadMs)?.transform
  if (!resolved) return clip.transform
  const settled = clip.transform
  const scaleK = resolved.scale > 1e-6 ? edited.scale / resolved.scale : 1
  return {
    xPct: settled.xPct + (edited.xPct - resolved.xPct),
    yPct: settled.yPct + (edited.yPct - resolved.yPct),
    widthPct: edited.widthPct,
    heightPct: edited.heightPct,
    scale: settled.scale * scaleK,
    rotation: settled.rotation + (edited.rotation - resolved.rotation),
    opacity: clamp01(settled.opacity + (edited.opacity - resolved.opacity)),
  }
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

/** Editor role for a layer created on the canvas, by engine type. */
function roleForLayerType(type: string): ClipRole {
  if (type === 'text') return 'text'
  if (type === 'video') return 'media'
  return 'object'
}

/**
 * Write the composer's edits back into the snapshot, by clip id.
 *
 *  - Transform edits go through `mergeEditedTransform` so a drag lands on the
 *    settled pose even while the playhead sits on an enter/exit ramp.
 *  - Composer layers with NO backing clip are creations (the canvas
 *    "+ Video/Image/Text" menu, layer duplicate): they become clips at the
 *    playhead on the top visual track, with `none` ramps so what you just
 *    placed is visible where you placed it (ramps opt in via the timing panel).
 *  - Clips that are live+visual at this playhead but MISSING from the composer
 *    state were removed via the layer list: drop them. Non-live clips are
 *    absent from every projection, so they're always kept.
 *
 * The caller (VideoEditor) is responsible for passing the same `playheadMs`
 * the state was projected at.
 */
export function applyComposerEditsToSnapshot(
  snapshot: VideoProjectSnapshot,
  composerState: ComposerState,
  playheadMs: number,
): VideoProjectSnapshot {
  const byId = new Map(composerState.layers.map((l) => [l.id, l]))
  const clips = snapshot.clips
    .filter((clip) => {
      if (byId.has(clip.id)) return true
      // Mirror the projection's inclusion rule exactly: only clips that WERE
      // projected (visual track + live) can have been removed by the list.
      const track = trackOf(snapshot, clip)
      const wasProjected = track?.kind === 'visual' && resolveClipFrame(clip, playheadMs) !== null
      return !wasProjected
    })
    .map((clip) => {
      const cl = byId.get(clip.id)
      if (!cl) return clip
      return {
        ...clip,
        layer: cl.layer,
        box: cl.box,
        transform: mergeEditedTransform(clip, cl.transform, playheadMs),
      }
    })

  const known = new Set(snapshot.clips.map((c) => c.id))
  const topVisual = snapshot.tracks
    .filter((t) => t.kind === 'visual')
    .reduce<(typeof snapshot.tracks)[number] | null>(
      (best, t) => (!best || t.index > best.index ? t : best),
      null,
    )
  if (topVisual) {
    for (const l of composerState.layers) {
      if (known.has(l.id)) continue
      clips.push({
        id: l.id,
        trackId: topVisual.id,
        layer: l.layer,
        role: roleForLayerType(l.layer.type),
        startMs: Math.round(playheadMs),
        durationMs: DEFAULT_CLIP_MS,
        transform: l.transform ?? DEFAULT_TRANSFORM,
        box: l.box,
        enterAnim: { kind: 'none', durationMs: 0 },
        exitAnim: { kind: 'none', durationMs: 0 },
        visible: l.visible,
      })
    }
  }

  return {
    ...snapshot,
    clips,
    durationMs: Math.max(snapshot.durationMs, clipsEndMs(clips)),
    background: composerState.background,
  }
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
