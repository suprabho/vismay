'use client'

import { useEffect, useRef, useState } from 'react'
import type { StageConfig } from '@vismay/viz-engine'

interface PreviewFrameProps {
  src: string
  /** Current playhead — posted to the iframe as `viz-story-seek` on every change. */
  seek: { unit: number; t: number } | null
  /**
   * The edited (possibly unsaved) stage config — posted as `viz-story-stage`
   * on every change (rAF-coalesced) so the preview renders edits live, no
   * reload. Null when the story has no stage.
   */
  stage: StageConfig | null
  /** True when the stage has `role: 'object'` entities (portrait-hidden by default). */
  hasObjects: boolean
}

/**
 * Hosts the `StoryTimelineFrameSurface` iframe and owns the parent side of
 * the editor postMessage bridge (the shell owns the receiving side — see
 * `StoryShell.tsx`'s editor effects): outbound `viz-story-seek` and
 * `viz-story-stage`, both buffered until the iframe's `viz-story-ready`
 * handshake fires and re-flushed after any reload, so a fast initial drag or
 * an unsaved edit is never lost to a message sent before the listener
 * attaches.
 */
export default function PreviewFrame({ src, seek, stage, hasObjects }: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [isPortraitBox, setIsPortraitBox] = useState(false)
  const pendingRef = useRef<{ unit: number; t: number } | null>(null)
  const latestStageRef = useRef<StageConfig | null>(stage)
  const stageRafRef = useRef<number | null>(null)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      if (e.data?.type !== 'viz-story-ready') return
      setReady(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // The iframe reloads on src change (a fresh signed URL, or a different
  // story) — reset the handshake so seeks buffer again until it re-fires.
  // Adjusted during render (React's prev-value pattern) rather than in an
  // effect.
  const [prevSrc, setPrevSrc] = useState(src)
  if (prevSrc !== src) {
    setPrevSrc(src)
    setReady(false)
  }

  useEffect(() => {
    if (!seek) return
    const win = iframeRef.current?.contentWindow
    if (!ready || !win) {
      pendingRef.current = seek
      return
    }
    win.postMessage({ type: 'viz-story-seek', unit: seek.unit, t: seek.t }, '*')
  }, [seek, ready])

  // Live stage push: rAF-coalesced (a ScrubField drag fires per pointermove;
  // one message per frame is plenty) and gated on the ready handshake.
  useEffect(() => {
    latestStageRef.current = stage
    if (!ready) return
    if (stageRafRef.current != null) return
    stageRafRef.current = requestAnimationFrame(() => {
      stageRafRef.current = null
      const win = iframeRef.current?.contentWindow
      if (!win) return
      win.postMessage({ type: 'viz-story-stage', stage: latestStageRef.current }, '*')
    })
  }, [stage, ready])
  useEffect(
    () => () => {
      if (stageRafRef.current != null) cancelAnimationFrame(stageRafRef.current)
    },
    []
  )

  useEffect(() => {
    if (!ready) return
    const win = iframeRef.current?.contentWindow
    if (!win) return
    if (pendingRef.current) {
      win.postMessage(
        { type: 'viz-story-seek', unit: pendingRef.current.unit, t: pendingRef.current.t },
        '*'
      )
      pendingRef.current = null
    }
    // Re-sync the edited stage after any (re)load — the fresh document only
    // knows the server config until we tell it otherwise.
    if (latestStageRef.current) {
      win.postMessage({ type: 'viz-story-stage', stage: latestStageRef.current }, '*')
    }
  }, [ready])

  // Surface (don't fight) resolveStage's portrait degrade: a taller-than-wide
  // preview box hides `role: 'object'` entities by default.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setIsPortraitBox(r.height > r.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <iframe
        ref={iframeRef}
        src={src}
        className="h-full w-full border-0 bg-black"
        title="Stage timeline preview"
      />
      {isPortraitBox && hasObjects && (
        <span className="absolute left-2 top-2 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
          Portrait preview — object entities hidden
        </span>
      )}
    </div>
  )
}
