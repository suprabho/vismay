'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { OverlayConfig, StoryBackgroundConfig } from '@vismay/viz-engine'
import { auraCaptureUrl, overlayBackground } from '@vismay/viz-engine'

/**
 * Deck-format page backdrop for EXPORT surfaces (report / slides PDF, share
 * cards). Mirrors the live `StoryBackgroundSlot` layering — backdrop, then
 * tint, then `defaults.overlay` — but paints the aura as a static still
 * (`auraCaptureUrl`) instead of the animated cross-origin iframe, which
 * neither Playwright's `page.pdf()` nor html-to-image can rasterize.
 *
 * Absolutely positioned to fill its (relative, overflow-hidden) parent and
 * placed FIRST in DOM order so the slide/card content paints above it without
 * any z-index juggling. The parent's own `background: var(--color-bg)` stays
 * underneath as the fallback for a slow or missing still.
 */
interface Props {
  background: StoryBackgroundConfig
  overlay?: OverlayConfig
  /**
   * Resolution to request the aura still at, in device px of the exported
   * artefact (1920×1080 for a slide, the 1080-wide output size for a share
   * card — NOT the card's 390px DOM size). Layout is always 100% of the parent.
   */
  width: number
  height: number
  /** Extra resolution multiplier for the still. Defaults to 1. */
  dpr?: number
  /**
   * Fires once when the still has loaded — or failed, so a dead aura service
   * can't stall a capture (the theme colour underneath is the fallback).
   * Count one readiness signal per mounted backdrop iff `backdropNeedsSignal`.
   */
  onReady?: () => void
}

/** Whether an `ExportBackdrop` for this config mounts an image (= one readiness signal). */
export function backdropNeedsSignal(bg: StoryBackgroundConfig | null | undefined): boolean {
  return bg?.type === 'aura' || bg?.type === 'image'
}

const fill: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' }

/**
 * `<img>` whose load/error signal is robust to SSR: React's `onLoad` never
 * fires for an image that finished loading before hydration attached the
 * handler, which is exactly what happens to a cached still — so we check
 * `complete` on mount and only then fall back to listeners.
 *
 * A still that FAILS unmounts itself. Chromium paints nothing for a broken
 * `alt=""` image anyway, but html-to-image (share cards) turns a failed
 * fetch into an empty `src` on its clone and rejects the whole capture on
 * the resulting error event — so a dead aura service must leave no `<img>`
 * behind for it to trip over. The theme colour underneath is the fallback.
 */
function StillImage({
  src,
  fit,
  position,
  onReady,
}: {
  src: string
  fit: CSSProperties['objectFit']
  position?: string
  onReady?: () => void
}) {
  const ref = useRef<HTMLImageElement>(null)
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
    const el = ref.current
    if (!el) return
    let fired = false
    const fire = (ok: boolean) => {
      if (fired) return
      fired = true
      if (!ok) setFailed(true)
      readyRef.current?.()
    }
    if (el.complete) {
      fire(el.naturalWidth > 0)
      return
    }
    const onLoad = () => fire(true)
    const onError = () => fire(false)
    el.addEventListener('load', onLoad)
    el.addEventListener('error', onError)
    return () => {
      el.removeEventListener('load', onLoad)
      el.removeEventListener('error', onError)
    }
  }, [src])
  if (failed) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      decoding="sync"
      style={{
        ...fill,
        width: '100%',
        height: '100%',
        objectFit: fit,
        objectPosition: position ?? 'center',
        display: 'block',
      }}
    />
  )
}

export default function ExportBackdrop({
  background,
  overlay,
  width,
  height,
  dpr = 1,
  onReady,
}: Props) {
  if (background.type === 'none') return null
  const overlayBg = overlayBackground(overlay)
  return (
    <div aria-hidden data-export-backdrop={background.type} style={{ ...fill, overflow: 'hidden' }}>
      {background.type === 'aura' && (
        <>
          <StillImage
            src={auraCaptureUrl(background.slug, { w: width, h: height, dpr })}
            fit="cover"
            onReady={onReady}
          />
          {background.tint && (
            <div
              style={{
                ...fill,
                background: background.tint,
                mixBlendMode: background.tintBlendMode ?? 'multiply',
              }}
            />
          )}
        </>
      )}
      {background.type === 'image' && (
        <StillImage
          src={background.src}
          fit={background.fit ?? 'cover'}
          position={background.position}
          onReady={onReady}
        />
      )}
      {background.type === 'color' && <div style={{ ...fill, background: background.value }} />}
      {overlayBg && <div style={{ ...fill, background: overlayBg }} />}
    </div>
  )
}
