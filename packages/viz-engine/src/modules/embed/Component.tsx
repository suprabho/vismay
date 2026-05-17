'use client'

import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { resolveAssetUrl } from '../../lib/assetUrl'
import type { VizCaptureHandle, VizRenderProps } from '../../types'
import type { EmbedLayerConfig } from './index'

/**
 * Embed viz module. In live `scroll` / `autoplay` mode renders the actual
 * iframe; in `capture` / `print` mode swaps to the required `poster` image so
 * the headless capture pipelines (PDF, share, video) get a deterministic frame
 * even when the cross-origin iframe refuses to rasterize.
 *
 * The container always sits at `width: 100%; height: 100%` — the slot's
 * positioning wrapper decides the actual size and aspect, while
 * `config.aspect` is applied to the inner iframe so embed sources that
 * ignore parent height (most do) stay correctly framed.
 */
export default function EmbedLayerComponent({
  config,
  mode,
  noteReady,
  captureRef,
}: VizRenderProps<EmbedLayerConfig>) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const posterUrl = resolveAssetUrl(config.poster)
  const showPoster = mode === 'capture' || mode === 'print'
  const [iframeLoaded, setIframeLoaded] = useState(false)

  // Capture-mode readiness is gated on the poster image decoding. Live mode
  // waits on the iframe's `load` event plus a 500 ms beat (the readiness
  // generalization in Phase 5 will own the beat; for now we settle inline).
  useEffect(() => {
    if (showPoster) {
      const img = imgRef.current
      if (img && img.complete && img.naturalWidth > 0) noteReady()
      return
    }
    if (iframeLoaded) {
      const t = setTimeout(() => noteReady(), 500)
      return () => clearTimeout(t)
    }
  }, [showPoster, iframeLoaded, noteReady])

  useImperativeHandle<VizCaptureHandle | null, VizCaptureHandle>(
    captureRef ?? { current: null },
    () => ({
      freeze: async () => {
        // Swap-to-poster already happens via the `mode` prop, but a defensive
        // decode here ensures the rasterizer sees a complete bitmap.
        const img = imgRef.current
        if (!img) return
        try {
          await img.decode()
        } catch {
          /* noop */
        }
      },
    }),
    []
  )

  if (showPoster) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imgRef}
        src={posterUrl}
        alt={config.title ?? ''}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
        onLoad={() => noteReady()}
        draggable={false}
      />
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <iframe
        ref={iframeRef}
        src={config.src}
        title={config.title ?? 'Embedded content'}
        sandbox={config.sandbox}
        allow={config.allow}
        referrerPolicy={config.referrerPolicy as React.HTMLAttributeReferrerPolicy | undefined}
        style={{
          width: '100%',
          height: '100%',
          aspectRatio: config.aspect === 'auto' ? undefined : (config.aspect ?? '16 / 9'),
          border: 0,
          display: 'block',
        }}
        onLoad={() => setIframeLoaded(true)}
      />
    </div>
  )
}
