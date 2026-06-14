/**
 * Curated AI-image styles for the footshorts share-card creator.
 *
 * Each style is a prompt PREFIX (look/medium/mood) layered on top of the
 * editor's subject and the active brand palette, all run through the same base
 * image model. Keeping the variety in the prompt (rather than swapping models)
 * keeps output on-brand and cost predictable. `model` defaults to the gateway's
 * `image.default` (Gemini 3 Pro Image); `seedream` is offered as a cheap option
 * for iteration.
 *
 * Shared by the client picker (labels/descriptions) and the generate route
 * (prompt assembly), so the two never drift.
 */

export type ShareImageModel = 'image.default' | 'image.seedream'

export interface ShareImageStyle {
  id: string
  label: string
  /** One-liner shown under the style chip. */
  hint: string
  /** Look/medium/mood prefix prepended to the subject. */
  promptPrefix: string
}

export const SHARE_IMAGE_STYLES: ShareImageStyle[] = [
  {
    id: 'editorial-poster',
    label: 'Editorial poster',
    hint: 'Bold sports-magazine cover, dramatic studio light',
    promptPrefix:
      'A bold editorial sports-magazine poster illustration, dramatic rim lighting, high contrast, cinematic depth of field, clean negative space for a headline',
  },
  {
    id: 'neon-match-night',
    label: 'Neon match-night',
    hint: 'Floodlit stadium, electric neon, energetic',
    promptPrefix:
      'A vibrant neon match-night scene, floodlit stadium atmosphere, electric glow, motion energy, saturated cyan and magenta highlights against deep shadow',
  },
  {
    id: 'vintage-terrace',
    label: 'Vintage terrace',
    hint: 'Retro 70s print, grain, warm muted tones',
    promptPrefix:
      'A vintage 1970s football-terrace print, screen-printed poster texture, visible paper grain, warm muted ochre and teal palette, nostalgic and analog',
  },
  {
    id: 'minimal-brand',
    label: 'Minimal brand',
    hint: 'Flat geometric, lots of space, modern',
    promptPrefix:
      'A clean minimal flat-design illustration, bold geometric shapes, generous negative space, modern vector look, restrained palette, crisp and contemporary',
  },
  {
    id: 'creative-caricature',
    label: 'Creative Caricature',
    hint: 'Playful exaggerated cartoon caricature',
    promptPrefix:
      'A playful hand-drawn caricature, exaggerated features and expressive proportions, bold ink outlines, vibrant cel-shaded color, witty and characterful sports-cartoon style',
  },
]

export function findShareImageStyle(id: string): ShareImageStyle | undefined {
  return SHARE_IMAGE_STYLES.find((s) => s.id === id)
}

/**
 * Compose the final image prompt: style prefix → subject → optional brand-palette
 * hint (hex list) so generations sit alongside the rest of the card.
 */
export function buildShareImagePrompt(opts: {
  style: ShareImageStyle
  subject: string
  paletteHexes?: string[]
}): string {
  const { style, subject, paletteHexes } = opts
  const parts = [style.promptPrefix.trim(), subject.trim()]
  const palette = (paletteHexes ?? []).filter(Boolean)
  if (palette.length > 0) {
    parts.push(`Tie the palette to these brand colors: ${palette.join(', ')}.`)
  }
  parts.push('No text, no watermark, no logos.')
  return parts.filter(Boolean).join('. ').replace(/\.\.+/g, '.')
}
