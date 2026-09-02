'use client'

import type { ComponentType } from 'react'
import type { OverlayConfig, StoryBackgroundConfig } from '@vismay/viz-engine'
import { auraCaptureUrl, overlayBackground, resolveStoryBackground } from '@vismay/viz-engine'

/** Host-injected aura iframe renderer (e.g. vizmaya's AuraBackground). */
type AuraComponentType = ComponentType<{ slug: string; input?: 'off' | 'mic' }>

type RenderMode = 'scroll' | 'autoplay' | 'capture' | 'print'

/**
 * Page-level backdrop. Mounts once outside the snap container and persists
 * across every section/slide. Resolution order:
 *
 *   1. `defaults.storyBackground` (explicit config)
 *   2. `frontmatterAura` (legacy field that also drives the home tile)
 *   3. `{ type: 'none' }`
 *
 * In `mode === 'print'` the animated aura iframe is swapped for a static
 * still of the same scene (`auraCaptureUrl`) — an iframe never survives PDF
 * capture, a plain `<img>` does. The theme colour stays underneath as the
 * fallback while the still loads (or if the aura service is down).
 *
 * Sits at z-index -2 so the story shell's own background slot (z-0) and
 * foreground (z-10+) layer cleanly on top. The accompanying overlay layer
 * (`<StoryBackgroundOverlay>`) sits at z-index -1.
 */
export default function StoryBackgroundSlot({
  config,
  frontmatterAura,
  mode = 'scroll',
  AuraComponent,
}: {
  config?: StoryBackgroundConfig
  frontmatterAura?: string
  mode?: RenderMode
  /** Host-injected aura renderer. When omitted, the aura layer is skipped. */
  AuraComponent?: AuraComponentType
}) {
  const resolved: StoryBackgroundConfig = resolveStoryBackground(config, frontmatterAura)

  if (resolved.type === 'none') return null

  // Print mode: the aura embed never makes it into a rendered PDF, so paint a
  // static still of the scene instead (same tint layering as the live path).
  // Sized for a landscape viewport; `cover` absorbs any aspect mismatch.
  if (mode === 'print' && resolved.type === 'aura') {
    return (
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: -2,
          background: 'var(--color-bg, #000)',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={auraCaptureUrl(resolved.slug, { w: 1920, h: 1080 })}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
        {resolved.tint && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: resolved.tint,
              mixBlendMode: resolved.tintBlendMode ?? 'multiply',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    )
  }

  if (resolved.type === 'aura') {
    const fixed = resolved.fixed ?? true
    return (
      <div
        aria-hidden
        style={{
          position: fixed ? 'fixed' : 'absolute',
          inset: 0,
          zIndex: -2,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        {AuraComponent && (
          <AuraComponent slug={resolved.slug} input={resolved.input === 'on' ? 'mic' : 'off'} />
        )}
        {resolved.tint && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: resolved.tint,
              mixBlendMode: resolved.tintBlendMode ?? 'multiply',
              pointerEvents: 'none',
            }}
          />
        )}
        <style>{`
          .bn-aura { position: absolute; inset: 0; overflow: hidden; }
          .bn-aura iframe {
            position: absolute; inset: 0; width: 100%; height: 100%;
            border: 0; display: block; background: transparent;
          }
        `}</style>
      </div>
    )
  }

  if (resolved.type === 'image') {
    return (
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: -2,
          backgroundImage: `url(${resolved.src})`,
          backgroundSize: resolved.fit ?? 'cover',
          backgroundPosition: resolved.position ?? 'center',
          backgroundRepeat: 'no-repeat',
          pointerEvents: 'none',
        }}
      />
    )
  }

  // color
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -2,
        background: resolved.value,
        pointerEvents: 'none',
      }}
    />
  )
}

/**
 * Darken / tint layer painted between the story backdrop and the foreground
 * content. Critical for chart legibility over busy aura motion.
 *
 * Renders nothing when `config` is absent — legacy stories keep their existing
 * layering untouched.
 */
export function StoryBackgroundOverlay({
  config,
}: {
  config?: OverlayConfig
  /**
   * Accepted for callers that thread the render mode through, but no longer
   * consulted: print paints the aura still (see above), so the overlay — what
   * keeps charts legible over the scene — applies in every mode.
   */
  mode?: RenderMode
}) {
  const background = overlayBackground(config)
  if (!background) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        background,
        pointerEvents: 'none',
      }}
    />
  )
}
