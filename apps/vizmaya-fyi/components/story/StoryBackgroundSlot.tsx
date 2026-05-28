'use client'

import AuraBackground from '@/components/AuraBackground'
import type { OverlayConfig, StoryBackgroundConfig } from '@vismay/viz-engine'

type RenderMode = 'scroll' | 'autoplay' | 'capture' | 'print'

/**
 * Page-level backdrop. Mounts once outside the snap container and persists
 * across every section/slide. Resolution order:
 *
 *   1. `defaults.storyBackground` (explicit config)
 *   2. `frontmatterAura` (legacy field that also drives the home tile)
 *   3. `{ type: 'none' }`
 *
 * In `mode === 'print'` the aura is replaced with the theme background color
 * so PDF exports stay legible — animated aurorae render terribly in print.
 *
 * Sits at z-index -2 so the story shell's own background slot (z-0) and
 * foreground (z-10+) layer cleanly on top. The accompanying overlay layer
 * (`<StoryBackgroundOverlay>`) sits at z-index -1.
 */
export default function StoryBackgroundSlot({
  config,
  frontmatterAura,
  mode = 'scroll',
}: {
  config?: StoryBackgroundConfig
  frontmatterAura?: string
  mode?: RenderMode
}) {
  const resolved: StoryBackgroundConfig =
    config ?? (frontmatterAura ? { type: 'aura', slug: frontmatterAura } : { type: 'none' })

  if (resolved.type === 'none') return null

  // Print mode: collapse anything visually busy into a flat theme-colored
  // surface. The overlay's color (Phase 2.4) is what carries any remaining
  // tint; the aura embed never makes it into the rendered PDF.
  if (mode === 'print') {
    return (
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: -2,
          background: 'var(--color-bg, #000)',
          pointerEvents: 'none',
        }}
      />
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
        <AuraBackground slug={resolved.slug} input={resolved.input === 'on' ? 'mic' : 'off'} />
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
  mode = 'scroll',
}: {
  config?: OverlayConfig
  mode?: RenderMode
}) {
  if (!config) return null
  // In print mode, drop the overlay too — the print-mode backdrop is already
  // a flat solid; an additional translucent layer would just darken text.
  if (mode === 'print') return null

  const baseColor = config.color
  const baseOpacity = config.opacity ?? 1
  const baseBackground = baseColor
    ? config.opacity != null
      ? mixWithOpacity(baseColor, baseOpacity)
      : baseColor
    : undefined

  const gradientBackground = config.gradient
    ? config.gradient.type === 'radial'
      ? `radial-gradient(circle at center, ${config.gradient.from}, ${config.gradient.to})`
      : `linear-gradient(${config.gradient.angle ?? 'to bottom'}, ${config.gradient.from}, ${config.gradient.to})`
    : undefined

  // When both a solid color and a gradient are specified, layer gradient over
  // color via CSS multi-background. Author intent in the deck spec is
  // gradient-above-color, so the gradient comes first in the shorthand.
  const background = gradientBackground && baseBackground
    ? `${gradientBackground}, ${baseBackground}`
    : (gradientBackground ?? baseBackground)

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

/**
 * Best-effort: combine a CSS color (hex / rgb / rgba / theme var) with an
 * opacity. For hex/rgb we can construct rgba; for anything else we fall back
 * to wrapping in a CSS `color-mix` against transparent so the alpha applies
 * without requiring the input to be a known format.
 */
function mixWithOpacity(color: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity))
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1]
    const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16)
    const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16)
    const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
  return `color-mix(in srgb, ${color} ${a * 100}%, transparent)`
}
