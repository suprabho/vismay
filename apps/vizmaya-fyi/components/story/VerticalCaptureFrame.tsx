'use client'

import { useEffect, useState, type ReactNode } from 'react'
import AuraBackground from '@/components/AuraBackground'

/**
 * Compose wrapper used by the 9:16 video render pipeline. When the page
 * URL has `?compose=vertical` set, the existing story content is loaded
 * inside a centered 4:5 iframe (the YouTube Shorts safe-zone) so its
 * layout responds to the 4:5 viewport — `h-svh` resolves to the inner
 * height, not the outer 9:16 frame. The surrounding 9:16 area is filled
 * with the story's `aura` iframe.
 *
 * Embedding via iframe (rather than just CSS-constraining children) is
 * what fixes the original clipping: the story page's section heights are
 * `h-svh`, which would otherwise overflow the 4:5 box and crop top + bottom.
 *
 * When `?compose=vertical` is absent the wrapper renders children directly
 * with zero added DOM, so regular `/story/<slug>` traffic is unaffected.
 *
 * Activation is client-side (reads window.location.search on mount) — this
 * preserves SSG for normal page views. The capture pipeline waits for
 * `[data-unit-index]` inside the inner iframe before recording, by which
 * point both frames have hydrated.
 */
export default function VerticalCaptureFrame({
  slug,
  auraSlug,
  children,
}: {
  /** Story slug — used to build the inner iframe's src. */
  slug: string
  /** Slug of the per-story aura embed; falls back to theme background when absent. */
  auraSlug?: string
  children: ReactNode
}) {
  const [compose, setCompose] = useState(false)
  const [iframeSrc, setIframeSrc] = useState<string | null>(null)
  const [autoplay, setAutoplay] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('compose') !== 'vertical') return
    setCompose(true)
    setAutoplay(params.get('autoplay') === '1')
    // The iframe loads the same story page minus the compose param, so the
    // inner page renders its normal story content (no recursive wrap).
    params.delete('compose')
    const qs = params.toString()
    setIframeSrc(`/story/${slug}${qs ? `?${qs}` : ''}`)
  }, [slug])

  if (!compose) return <>{children}</>

  return (
    <div className="vcf-frame">
      {auraSlug && <AuraBackground slug={auraSlug} input={autoplay ? 'mic' : 'off'} />}
      {iframeSrc && (
        <iframe
          src={iframeSrc}
          className="vcf-inner"
          title="Story content"
          /* Tagged so the render module can locate this exact iframe. */
          data-vcf-inner=""
        />
      )}
      <style>{`
        /* Outer 9:16 frame fills the viewport. Background falls back to the
           story theme color when no aura is set. */
        .vcf-frame {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: var(--color-bg, #fff);
        }
        /* Aura iframe sits at the back, filling the entire 9:16 frame. */
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
        /* Central 4:5 iframe holding the story. Its own viewport drives
           the inner page's layout, so 100vh / 100svh resolve to the 4:5
           height and nothing gets clipped at top or bottom. */
        .vcf-inner {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 100%;
          aspect-ratio: 4 / 5;
          border: 0;
          display: block;
          background: var(--color-bg, #fff);
          z-index: 1;
        }
      `}</style>
    </div>
  )
}
