'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { storyUrl, VIZMAYA_ORIGIN } from './url'

export interface StoryEmbedProps {
  /** Story slug rendered by the vizmaya story view. */
  slug: string
  /** Render origin. Defaults to vizmaya.fyi. */
  origin?: string
  /** Iframe title (accessibility). */
  title?: string
  /**
   * Cross-origin frames can stay quiet about load/error, so the loading overlay
   * is force-hidden after this many ms as a safety net.
   */
  timeoutMs?: number
  /** Spinner colour. Defaults to the host theme accent CSS variable. */
  spinnerColor?: string
  /** Backdrop shown under/over the frame while it loads. Defaults to host bg. */
  backgroundColor?: string
  /** Branding/chrome overlaid on top of the frame (back button, logo, …). */
  children?: ReactNode
}

/**
 * Embeds the vizmaya-rendered story view in an <iframe> and lets the host
 * overlay its own chrome via `children`. Styled with inline CSS variables
 * (`--color-bg`, `--color-accent`) rather than Tailwind utilities, so it themes
 * itself from whatever app embeds it and needs no Tailwind `@source` wiring.
 *
 * Replicating in a new web app: `<StoryEmbed slug={slug}>{backButton}</StoryEmbed>`.
 */
export function StoryEmbed({
  slug,
  origin = VIZMAYA_ORIGIN,
  title = 'Editorial story',
  timeoutMs = 6000,
  spinnerColor = 'var(--color-accent, #888)',
  backgroundColor = 'var(--color-bg, #000)',
  children,
}: StoryEmbedProps) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), timeoutMs)
    return () => clearTimeout(t)
  }, [timeoutMs])

  return (
    <div style={{ position: 'fixed', inset: 0, background: backgroundColor }}>
      <iframe
        src={storyUrl(slug, origin)}
        title={title}
        onLoad={() => setLoaded(true)}
        allow="fullscreen"
        style={{ width: '100%', height: '100%', border: 0 }}
      />

      {!loaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: backgroundColor,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              border: `2px solid ${spinnerColor}`,
              borderTopColor: 'transparent',
              borderRadius: 9999,
              animation: 'vismay-story-embed-spin 0.7s linear infinite',
            }}
          />
        </div>
      )}

      {children}

      <style>{`@keyframes vismay-story-embed-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
