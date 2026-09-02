import type { OverlayConfig, StoryBackgroundConfig } from './storyConfig.types'

/**
 * Aura scene catalog (`aura.promad.design`). The vismay repo references scenes
 * only by slug; the catalog itself is not vendored. Two render forms exist:
 *
 *   - `auraEmbedUrl`   → the live animated embed (an iframe). Used on the home
 *                        grid tiles and as the deck format's page backdrop.
 *   - `auraCaptureUrl` → a static PNG still of the same scene, rendered by the
 *                        catalog's headless Chromium (Fly `aura-render`, cached
 *                        upstream). Used by every EXPORT surface — report /
 *                        slides PDF, share cards, print mode — because a
 *                        cross-origin animated iframe never survives PDF or
 *                        html-to-image capture, whereas a plain `<img>` does.
 */
export const AURA_ORIGIN = 'https://aura.promad.design'

export interface AuraEmbedOptions {
  /** `mic` lets the aura react to playing audio. */
  input?: 'off' | 'mic'
  theme?: 'light' | 'dark'
}

/** Live animated embed URL (iframe `src`). */
export function auraEmbedUrl(
  slug: string,
  { input = 'off', theme = 'light' }: AuraEmbedOptions = {}
): string {
  return `${AURA_ORIGIN}/embed/${encodeURIComponent(slug)}?hideText=true&hideIcons=true&input=${input}&theme=${theme}`
}

export interface AuraCaptureOptions {
  /** Still width in CSS px (the surface being painted: slide / page / card). */
  w: number
  /** Still height in CSS px. */
  h: number
  /** Device-pixel multiplier — the PNG is `w*dpr × h*dpr`. Defaults to 1. */
  dpr?: number
}

/**
 * Static still of a scene: `/scenes/<slug>/capture.png?w=&h=&dpr=`. Request the
 * exact aspect of the target surface so `object-fit: cover` never has to crop.
 */
export function auraCaptureUrl(slug: string, { w, h, dpr = 1 }: AuraCaptureOptions): string {
  const q = new URLSearchParams({
    w: String(Math.round(w)),
    h: String(Math.round(h)),
    dpr: String(dpr),
  })
  return `${AURA_ORIGIN}/scenes/${encodeURIComponent(slug)}/capture.png?${q}`
}

/**
 * Page-level backdrop resolution shared by the live story page and every
 * export surface: `defaults.storyBackground` → frontmatter `aura` → none.
 */
export function resolveStoryBackground(
  config: StoryBackgroundConfig | undefined,
  frontmatterAura: string | undefined
): StoryBackgroundConfig {
  if (config) return config
  const slug = frontmatterAura?.trim()
  return slug ? { type: 'aura', slug } : { type: 'none' }
}

/**
 * CSS `background` value for a `defaults.overlay` block, or undefined when the
 * block yields nothing to paint. When both a solid color and a gradient are
 * specified they stack via CSS multi-background — author intent in the deck
 * spec is gradient-above-color, so the gradient comes first in the shorthand.
 */
export function overlayBackground(config: OverlayConfig | undefined): string | undefined {
  if (!config) return undefined
  const baseColor = config.color
  const baseBackground = baseColor
    ? config.opacity != null
      ? mixWithOpacity(baseColor, config.opacity)
      : baseColor
    : undefined
  const gradientBackground = config.gradient
    ? config.gradient.type === 'radial'
      ? `radial-gradient(circle at center, ${config.gradient.from}, ${config.gradient.to})`
      : `linear-gradient(${config.gradient.angle ?? 'to bottom'}, ${config.gradient.from}, ${config.gradient.to})`
    : undefined
  return gradientBackground && baseBackground
    ? `${gradientBackground}, ${baseBackground}`
    : (gradientBackground ?? baseBackground)
}

/**
 * Best-effort: combine a CSS color (hex / rgb / rgba / theme var) with an
 * opacity. Hex becomes rgba; anything else is wrapped in `color-mix` against
 * transparent so the alpha applies without requiring a known format.
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
