'use client'

import { useEffect, useRef, useState } from 'react'

interface PreviewFrameProps {
  src: string
  /** Current playhead — posted to the iframe as `viz-story-seek` on every change. */
  seek: { unit: number; t: number } | null
}

/**
 * Hosts the `StoryTimelineFrameSurface` iframe and owns the `viz-story-seek`
 * postMessage side of the E1 seek bridge (the shell owns the receiving side —
 * see `StoryShell.tsx`'s `viz-story-seek` effect). Buffers the first seek
 * until the iframe's `viz-story-ready` handshake fires, so a fast initial
 * drag isn't lost to a message sent before the listener is attached.
 */
export default function PreviewFrame({ src, seek }: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const pendingRef = useRef<{ unit: number; t: number } | null>(null)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'viz-story-ready') return
      setReady(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // The iframe reloads on src change (a fresh signed URL, a save nonce, or a
  // different story) — reset the handshake so seeks buffer again until it
  // re-fires. Adjusted during render (React's prev-value pattern) rather than
  // in an effect.
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

  useEffect(() => {
    if (!ready) return
    const win = iframeRef.current?.contentWindow
    if (win && pendingRef.current) {
      win.postMessage(
        { type: 'viz-story-seek', unit: pendingRef.current.unit, t: pendingRef.current.t },
        '*'
      )
      pendingRef.current = null
    }
  }, [ready])

  return (
    <iframe
      ref={iframeRef}
      src={src}
      className="h-full w-full border-0 bg-black"
      title="Stage timeline preview"
    />
  )
}
