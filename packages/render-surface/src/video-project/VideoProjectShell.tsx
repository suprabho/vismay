'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  LayerView,
  layerBoxStyle,
  PROJECT_OUTPUT_SIZE,
  resolveClipFrame,
  transformWrapperStyle,
  type VideoProjectSnapshot,
  type VideoTrack,
} from '@vismay/viz-admin'

/**
 * Headless render shell for a freeform video project — the WYSIWYG twin of the
 * admin editor's free-mode `PreviewPane`. It renders an aspect-correct frame
 * (sized to `PROJECT_OUTPUT_SIZE`) holding the background layer plus every live
 * visual clip, each placed by the SAME `transformWrapperStyle` + `layerBoxStyle`
 * the editor uses, so what you scrub is exactly what gets captured.
 *
 * Two modes:
 *   - preview (`capture` falsey): the shell auto-loops the playhead via
 *     requestAnimationFrame for an at-rest WYSIWYG play. Minimal — no controls.
 *   - capture (`capture` true): the shell exposes a deterministic seek API on
 *     `window.__videoProject__` so the headless renderer can advance the
 *     playhead frame-by-frame, settle every live `<video>` to the exact source
 *     time, and screenshot. `window.__projectReady__` flips true once the first
 *     paint + fonts have settled.
 */
export default function VideoProjectShell({
  snapshot,
  capture = false,
}: {
  snapshot: VideoProjectSnapshot
  capture?: boolean
}) {
  const { w, h } = PROJECT_OUTPUT_SIZE[snapshot.aspect]
  const durationMs = snapshot.durationMs

  // The current render clock position (ms from project t=0).
  const [playheadMs, setPlayheadMs] = useState(0)

  // The capture root — we query its live <video> elements by clip id to drive
  // deterministic seeks (refs would require threading through LayerView, which
  // mounts arbitrary viz modules; a scoped DOM query is simpler and robust).
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Index tracks by id so we can resolve a clip's z-order (track index) cheaply.
  const trackById = useMemo(() => {
    const m = new Map<string, VideoTrack>()
    for (const t of snapshot.tracks) m.set(t.id, t)
    return m
  }, [snapshot.tracks])

  // Visual clips only (audio tracks contribute sound, never pixels), sorted so
  // z-order is deterministic: lower track index first (drawn underneath), then
  // by original clip order within a track. Higher track index renders on top —
  // matching VideoTrack.index semantics ("higher renders on top").
  const visualClips = useMemo(() => {
    const indexed = snapshot.clips
      .map((clip, order) => ({ clip, order }))
      .filter(({ clip }) => {
        const track = trackById.get(clip.trackId)
        // Default unknown tracks to visual so an orphaned clip still draws.
        return (track?.kind ?? 'visual') !== 'audio'
      })
    indexed.sort((a, b) => {
      const ta = trackById.get(a.clip.trackId)?.index ?? 0
      const tb = trackById.get(b.clip.trackId)?.index ?? 0
      return ta - tb || a.order - b.order
    })
    return indexed.map(({ clip }) => clip)
  }, [snapshot.clips, trackById])

  /* ─── Preview: auto-loop the playhead via rAF ─────────────────────────── */
  useEffect(() => {
    if (capture) return // capture mode is driven entirely by seek()
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setPlayheadMs((prev) => {
        const next = prev + dt
        return next >= durationMs ? 0 : next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [capture, durationMs])

  /* ─── Capture: deterministic seek API on window ───────────────────────── */

  /**
   * Settle every live <video> in the capture root to the exact source frame for
   * `ms`, then resolve after the next paint. Source time math mirrors
   * `resolveClipFrame`: a clip displays `sourceInMs + (ms - startMs)` of its
   * media, in seconds for the DOM `currentTime`.
   */
  const settleVideos = useCallback(
    async (ms: number): Promise<void> => {
      const root = rootRef.current
      if (!root) return
      const waits: Promise<void>[] = []
      for (const clip of visualClips) {
        const live = ms >= clip.startMs && ms < clip.startMs + clip.durationMs
        if (!live) continue
        const el = root.querySelector<HTMLVideoElement>(
          `[data-clip-id="${clip.id}"] video`,
        )
        if (!el) continue
        const sourceInMs = clip.sourceInMs ?? 0
        const targetSec = (sourceInMs + (ms - clip.startMs)) / 1000
        // Skip a no-op seek — assigning the same currentTime never fires
        // 'seeked' and would hang the await.
        if (Math.abs(el.currentTime - targetSec) < 1 / 240) continue
        waits.push(
          new Promise<void>((resolve) => {
            const onSeeked = () => {
              el.removeEventListener('seeked', onSeeked)
              // One rVFC (or rAF fallback) so the decoded frame is composited
              // before the screenshot — paused <video> can rasterize black
              // until the next frame surfaces (see viz video Component freeze()).
              const anyEl = el as HTMLVideoElement & {
                requestVideoFrameCallback?: (cb: () => void) => number
              }
              if (typeof anyEl.requestVideoFrameCallback === 'function') {
                anyEl.requestVideoFrameCallback(() => resolve())
              } else {
                requestAnimationFrame(() => resolve())
              }
            }
            el.addEventListener('seeked', onSeeked)
            el.pause()
            el.currentTime = targetSec
          }),
        )
      }
      await Promise.all(waits)
    },
    [visualClips],
  )

  useEffect(() => {
    if (!capture) return

    interface CaptureWindow extends Window {
      __videoProject__?: {
        durationMs: number
        seek: (ms: number) => Promise<void>
      }
      __projectReady__?: boolean
    }
    const win = window as unknown as CaptureWindow

    // The seek primitive: set the playhead state (React re-renders the live
    // clip set + transforms), wait one paint so the DOM reflects it, then settle
    // every live <video> to its source frame and resolve after the next paint.
    const seek = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        setPlayheadMs(ms)
        // rAF #1: React has committed the new playhead → DOM reflects the live
        // clip set + transforms. Now nudge the videos.
        requestAnimationFrame(() => {
          void settleVideos(ms).then(() => {
            // rAF #2: a final paint after the video frames are composited.
            requestAnimationFrame(() => resolve())
          })
        })
      })

    win.__videoProject__ = { durationMs, seek }

    // Signal readiness once mounted + fonts loaded + a couple of paints have
    // landed (so the first layers + their fonts are on screen). The renderer
    // waits on this before its first seek/screenshot.
    let cancelled = false
    const markReady = () => {
      if (cancelled) return
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) win.__projectReady__ = true
        }),
      )
    }
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } })
      .fonts
    if (fonts?.ready) {
      void fonts.ready.then(markReady)
    } else {
      markReady()
    }

    return () => {
      cancelled = true
      delete win.__videoProject__
      win.__projectReady__ = false
    }
  }, [capture, durationMs, settleVideos])

  /* ─── Render ──────────────────────────────────────────────────────────── */

  // The frame is the exact output pixel size — the headless viewport matches it,
  // so screenshots are 1:1 with no upscale. A black backdrop fills any area a
  // background/clip doesn't cover (matches the editor canvas + video norms).
  const frameStyle: CSSProperties = {
    position: 'relative',
    width: w,
    height: h,
    overflow: 'hidden',
    background: '#000',
  }

  return (
    <div ref={rootRef} style={frameStyle} data-video-project-root>
      {/* Background layer (if any) fills the whole frame, drawn underneath. */}
      {snapshot.background && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <LayerView layer={snapshot.background} />
        </div>
      )}

      {/* Visual clips, only while live, placed by their resolved transform. */}
      {visualClips.map((clip) => {
        const resolved = resolveClipFrame(clip, playheadMs)
        if (!resolved || !clip.visible) return null
        return (
          <div
            key={clip.id}
            data-clip-id={clip.id}
            style={transformWrapperStyle(resolved.transform, { sizeByWidth: true })}
          >
            <div
              className="relative h-full w-full overflow-hidden"
              style={layerBoxStyle(clip.box)}
            >
              <LayerView layer={clip.layer} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
