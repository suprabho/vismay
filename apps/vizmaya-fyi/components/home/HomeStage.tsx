'use client'

import { useEffect, useRef } from 'react'
import { CircleNotch } from '@phosphor-icons/react'
import { HOME_STAGE_MESSAGE, HOME_VIEW_META, homeStageUrl, type HomeStageFormat } from '@/lib/home/homeShape'

/** How long a stage gets to bring its runtime up before the page falls back to Scroll. */
const STAGE_TIMEOUT_MS = 12000

/**
 * The whole page as a book, a board or a deck: the stage document
 * (/home-stage/<format>) framed full-screen under the masthead. It reports
 * `ready` once its runtime is on (the frame fades in and takes the keys) and
 * `linear` when the reader asks it for the one-page view; a stage that isn't
 * ready in time is reported as failed. The page answers both by showing its
 * scroll version.
 */
export default function HomeStage({
  format,
  ready,
  onReady,
  onLinear,
  onFail,
}: {
  format: HomeStageFormat
  ready: boolean
  onReady: () => void
  onLinear: () => void
  onFail: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return
      const d = e.data as { type?: string; event?: string } | null
      if (!d || d.type !== HOME_STAGE_MESSAGE) return
      if (d.event === 'ready') {
        onReady()
        // Arrow keys turn pages and step slides straight away.
        frame.current?.contentWindow?.focus()
      } else if (d.event === 'linear') onLinear()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onReady, onLinear])

  useEffect(() => {
    if (ready) return
    const t = window.setTimeout(onFail, STAGE_TIMEOUT_MS)
    return () => window.clearTimeout(t)
  }, [ready, onFail])

  const label = HOME_VIEW_META[format].label.toLowerCase()
  return (
    <div className="fixed inset-x-0 bottom-0 top-16 bg-(--bg)">
      <iframe
        ref={frame}
        src={homeStageUrl(format)}
        title={`Vizmaya Labs, as a ${label}`}
        allowFullScreen
        className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
      />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center" role="status">
          <span className="flex items-center gap-3 font-(family-name:--serif) text-[24px] italic text-(--muted)">
            <CircleNotch size={20} className="animate-spin motion-reduce:animate-none" aria-hidden />
            Binding the {label}…
          </span>
        </div>
      )}
    </div>
  )
}
