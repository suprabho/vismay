'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { auraCaptureUrl } from '@vismay/viz-engine'

/**
 * Static still of an aura scene, for surfaces that rasterize the DOM
 * (html-to-image share-card exports, PDF capture). The live `AuraBackground`
 * iframe can never be captured; this `<img>` of
 * `aura.promad.design/scenes/<slug>/capture.png` can.
 *
 * `src` overrides the default capture URL (an uploaded poster, or the still
 * routed through a same-origin image proxy). Sized to fill its parent.
 *
 * A still that fails to load unmounts itself: html-to-image turns a failed
 * fetch into an empty `src` on its clone and rejects the whole capture on the
 * resulting error event, so a scene without a capture must leave no `<img>`
 * behind — the card's own background is the fallback.
 */
export function AuraPoster({
  slug,
  width,
  height,
  dpr = 1,
  src,
  className,
  style,
}: {
  slug: string
  /** Export size in px — the still is requested at exactly this aspect. */
  width: number
  height: number
  dpr?: number
  /** Explicit image URL (poster upload / proxied URL); defaults to the capture still. */
  src?: string
  className?: string
  style?: CSSProperties
}) {
  const resolved = src ?? auraCaptureUrl(slug, { w: width, h: height, dpr })
  const ref = useRef<HTMLImageElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
    const el = ref.current
    if (!el) return
    // `complete` on mount covers a cached image whose events fired before
    // hydration attached any handler.
    if (el.complete) {
      if (el.naturalWidth === 0) setFailed(true)
      return
    }
    const onError = () => setFailed(true)
    el.addEventListener('error', onError)
    return () => el.removeEventListener('error', onError)
  }, [resolved])
  if (failed) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={resolved}
      alt=""
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        ...style,
      }}
    />
  )
}

export default AuraPoster
