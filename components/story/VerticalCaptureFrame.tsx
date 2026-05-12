'use client'

import { useEffect, useState, type ReactNode } from 'react'
import AuraBackground from '@/components/AuraBackground'

/**
 * Compose wrapper used by the 9:16 video render pipeline. When the page
 * URL has `?compose=vertical` set, the existing story content is constrained
 * to a central 4:5 band (the YouTube Shorts safe-zone), and the surrounding
 * 9:16 frame is filled with the story's `aura` iframe — same component used
 * on the home-page bento tiles.
 *
 * When `?compose=vertical` is absent the wrapper renders children directly
 * with zero added DOM, so regular `/story/<slug>` traffic is unaffected.
 *
 * Activation is client-side (reads window.location.search on mount) — this
 * preserves SSG for normal page views. The capture pipeline waits for
 * `[data-unit-index]` before recording, by which point React has hydrated
 * and the wrap is in place.
 */
export default function VerticalCaptureFrame({
  auraSlug,
  children,
}: {
  /** Slug of the per-story aura embed; falls back to theme background when absent. */
  auraSlug?: string
  children: ReactNode
}) {
  const [compose, setCompose] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setCompose(params.get('compose') === 'vertical')
  }, [])

  if (!compose) return <>{children}</>

  return (
    <div className="vcf-frame">
      {auraSlug && <AuraBackground slug={auraSlug} />}
      <div className="vcf-inner">{children}</div>
      <style>{`
        /* Outer 9:16 frame fills the viewport. Background falls back to the
           story theme color when no aura is set. */
        .vcf-frame {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: var(--color-bg, #000);
        }
        /* Position the aura iframe to fill the entire frame. The component
           outputs <div class="bn-aura"><iframe/></div>; styles below mirror
           the home page CSS so it renders correctly outside HomeClient. */
        .vcf-frame > .bn-aura {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .vcf-frame > .bn-aura iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
          background: transparent;
        }
        /* Central 4:5 safe-zone, vertically centered inside the 9:16 frame.
           Story content renders here. Its theme bg is opaque so it covers
           the aura within the band — aura is visible only in the top and
           bottom letterbox strips. */
        .vcf-inner {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 100%;
          aspect-ratio: 4 / 5;
          overflow: hidden auto;
          background: var(--color-bg, #000);
          z-index: 1;
        }
      `}</style>
    </div>
  )
}
