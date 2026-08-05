'use client'

import { useEffect, useImperativeHandle, useRef } from 'react'
import type { CSSProperties } from 'react'
import { resolveAssetUrl } from '@vismay/viz-engine'
import type { VizCaptureHandle, VizRenderProps } from '@vismay/viz-engine'
import type { PolaroidLayerConfig } from './index'

/**
 * `travel:polaroid` — a photo in a white matte with an extra-deep bottom
 * border and a handwritten caption, optionally tilted and taped to the page.
 * The surrounding `<VizLayerFrame>` determines the slot box; the polaroid
 * centers itself inside it and sizes off the smaller edge so rotation never
 * clips against the frame.
 *
 * Capture-safe the same way the core image module is: `freeze()` awaits
 * `img.decode()`, `noteReady` fires on load/error/cached-complete.
 */
export default function PolaroidLayerComponent({
  config,
  noteReady,
  captureRef,
}: VizRenderProps<PolaroidLayerConfig>) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const url = resolveAssetUrl(config.src)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    if (img.complete) noteReady()
  }, [noteReady])

  useImperativeHandle<VizCaptureHandle | null, VizCaptureHandle>(
    captureRef ?? { current: null },
    () => ({
      freeze: async () => {
        const img = imgRef.current
        if (!img) return
        try {
          await img.decode()
        } catch {
          /* noop — capture proceeds with whatever painted */
        }
      },
    }),
    []
  )

  const rotation = config.rotation ?? 0
  const tape = config.tape ?? 'top'
  const shadow = config.shadow ?? true

  const frameStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    background: '#fdfcf8',
    padding: '4% 4% 0',
    maxWidth: '100%',
    maxHeight: '100%',
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    boxShadow: shadow ? '0 10px 28px rgba(20, 16, 8, 0.28)' : undefined,
    borderRadius: 2,
  }

  const tapeBase: CSSProperties = {
    position: 'absolute',
    background: 'rgba(232, 222, 184, 0.75)',
    boxShadow: '0 1px 2px rgba(20, 16, 8, 0.12)',
    pointerEvents: 'none',
  }
  const tapeStyle: CSSProperties | null =
    tape === 'top'
      ? { ...tapeBase, top: '-4%', left: '50%', width: '38%', height: '7%', transform: 'translateX(-50%) rotate(-2deg)' }
      : tape === 'corner'
        ? { ...tapeBase, top: '-5%', left: '-6%', width: '30%', height: '8%', transform: 'rotate(-40deg)' }
        : null

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <figure style={{ ...frameStyle, margin: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt={config.alt ?? config.caption ?? ''}
          style={{
            display: 'block',
            width: '100%',
            aspectRatio: '1 / 1',
            objectFit: 'cover',
            objectPosition: config.focus ?? 'center',
            background: '#e9e5da',
          }}
          loading="lazy"
          decoding="async"
          onLoad={() => noteReady()}
          onError={() => noteReady()}
          draggable={false}
        />
        <figcaption
          style={{
            minHeight: '2.6em',
            padding: '0.55em 0.2em 0.7em',
            fontFamily: "'Caveat', 'Segoe Script', 'Bradley Hand', cursive",
            fontSize: 'clamp(14px, 1.6vw, 20px)',
            lineHeight: 1.25,
            color: '#42392c',
            textAlign: 'center',
          }}
        >
          {config.caption ?? ''}
        </figcaption>
        {tapeStyle && <div aria-hidden style={tapeStyle} />}
      </figure>
    </div>
  )
}
