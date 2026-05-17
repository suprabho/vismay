'use client'

import { useEffect, useImperativeHandle, useRef } from 'react'
import type { CSSProperties } from 'react'
import { resolveAssetUrl } from '../../lib/assetUrl'
import type { VizCaptureHandle, VizRenderProps } from '../../types'
import type { ImageLayerConfig } from './index'

/**
 * Image viz module. Works in both the foreground and background slots — the
 * surrounding `<VizLayerFrame>` in the slot determines size, this component
 * just fits an `<img>` to fill its parent according to `config.fit` /
 * `config.focus`.
 *
 * Capture-safe by default: the `freeze()` hook awaits `img.decode()` so the
 * headless capture pipelines (PDF, share) don't rasterize a half-decoded
 * texture. `noteReady` fires on natural load (or immediately if cached) so
 * `useStoryReadiness` knows when this layer has paintable pixels.
 */
export default function ImageLayerComponent({
  config,
  noteReady,
  captureRef,
}: VizRenderProps<ImageLayerConfig>) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const url = resolveAssetUrl(config.src)

  // Cached images can fire `onLoad` before React attaches our handler — read
  // `complete` once on mount as the belt-and-braces signal.
  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    if (img.complete && img.naturalWidth > 0) {
      noteReady()
    }
  }, [noteReady])

  useImperativeHandle<VizCaptureHandle | null, VizCaptureHandle>(
    captureRef ?? { current: null },
    () => ({
      freeze: async () => {
        const img = imgRef.current
        if (!img) return
        // `decode()` resolves once the bitmap is ready to paint without a
        // first-frame jank; it rejects if the load itself failed, which we
        // swallow — the capture should not block on a broken asset.
        try {
          await img.decode()
        } catch {
          /* noop */
        }
      },
    }),
    []
  )

  const style: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: config.fit ?? 'cover',
    objectPosition: config.focus ?? 'center',
    display: 'block',
    background: config.background,
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={url}
      alt={config.alt ?? ''}
      style={style}
      onLoad={() => noteReady()}
      draggable={false}
    />
  )
}
