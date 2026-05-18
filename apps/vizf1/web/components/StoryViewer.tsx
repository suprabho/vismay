'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { NewsCard } from '@/lib/useNewsFeed'

const SEGMENT_MS = 6000
const HOLD_TO_PAUSE = true

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

type Props = {
  title: string
  segments: NewsCard[]
}

/**
 * Instagram-style segmented story viewer.
 *   - Top: one progress bar per segment, the active one fills over SEGMENT_MS.
 *   - Tap left third: previous; tap right two-thirds: next.
 *   - Hold (pointerdown ≥ 200ms): pause; release to resume.
 *   - Swipe down on the body: close.
 */
export function StoryViewer({ title, segments }: Props) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const startedAt = useRef<number>(Date.now())
  const elapsedBeforePause = useRef<number>(0)
  const touchStartY = useRef<number | null>(null)

  const segment = segments[index]

  useEffect(() => {
    startedAt.current = Date.now()
    elapsedBeforePause.current = 0
    setProgress(0)
    setPaused(false)
  }, [index])

  useEffect(() => {
    if (!segment) return
    let raf = 0
    const tick = () => {
      const now = Date.now()
      const total = paused
        ? elapsedBeforePause.current
        : elapsedBeforePause.current + (now - startedAt.current)
      const p = Math.min(1, total / SEGMENT_MS)
      setProgress(p)
      if (p >= 1) {
        if (index < segments.length - 1) {
          setIndex(index + 1)
        } else {
          router.back()
        }
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [index, paused, segment, segments.length, router])

  function tap(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width / 3) {
      // Previous
      if (index > 0) setIndex(index - 1)
      else {
        startedAt.current = Date.now()
        elapsedBeforePause.current = 0
      }
    } else {
      if (index < segments.length - 1) setIndex(index + 1)
      else router.back()
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    touchStartY.current = e.clientY
    if (!HOLD_TO_PAUSE) return
    const holdTimer = window.setTimeout(() => {
      elapsedBeforePause.current += Date.now() - startedAt.current
      setPaused(true)
    }, 200)
    const stop = () => {
      window.clearTimeout(holdTimer)
      if (paused) {
        startedAt.current = Date.now()
        setPaused(false)
      }
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const startY = touchStartY.current
    touchStartY.current = null
    if (startY != null && e.clientY - startY > 80) {
      router.back()
      return
    }
    // Treat short un-held release as a tap.
    if (!paused) tap(e)
  }

  if (segments.length === 0) {
    return (
      <div className="flex h-[100dvh] w-full flex-col items-center justify-center bg-bg text-text">
        <span className="text-sm text-muted">No stories yet for {title}</span>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-3 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-text"
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className="relative h-[100dvh] w-full select-none overflow-hidden bg-bg"
    >
      {/* Progress bars */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-3">
        {segments.map((_, i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-text/20">
            <div
              className="h-full bg-text transition-[width] duration-100 ease-linear"
              style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute inset-x-0 top-6 z-20 flex items-center justify-between px-4 pt-2">
        <span className="text-sm font-semibold text-text">{title}</span>
        <button
          type="button"
          onPointerUp={(e) => {
            e.stopPropagation()
            router.back()
          }}
          aria-label="Close"
          className="rounded-full bg-text/10 px-3 py-1 text-xs text-text backdrop-blur"
        >
          ✕
        </button>
      </div>

      {/* Body — single card per segment, same look as NewsReelCard */}
      <div className="relative h-full w-full">
        {segment?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={segment.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-surface to-bg" aria-hidden />
        )}
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background:
              'linear-gradient(to top, rgba(11,13,18,0.95) 0%, rgba(11,13,18,0.65) 30%, rgba(11,13,18,0.1) 70%, rgba(11,13,18,0.0) 100%)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 z-10 p-6 pb-12">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider">
            <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-text">
              {segment?.publisher}
            </span>
            <span className="text-text/70">{segment ? relativeTime(segment.publishedAt) : ''}</span>
          </div>
          <h2 className="text-2xl font-semibold leading-tight text-text">{segment?.headline}</h2>
          <p className="mt-3 line-clamp-5 text-sm leading-relaxed text-text/80">
            {segment?.summary}
          </p>
          {segment ? (
            <a
              href={segment.url}
              target="_blank"
              rel="noopener noreferrer"
              onPointerUp={(e) => e.stopPropagation()}
              className="mt-4 inline-block text-xs font-medium text-accent"
            >
              Read on {segment.publisher} →
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
