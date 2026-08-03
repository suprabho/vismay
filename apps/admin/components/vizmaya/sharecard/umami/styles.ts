import type { StyleTemplate } from '../composer/ImagePicker'

/**
 * AI-generation style presets for umami social frames, tuned to the reference
 * aesthetic (warm flat editorial food illustration). Provided to `ImagePicker`
 * via `ExtraStyleTemplatesContext`, so they appear ahead of the generic
 * built-ins and the first one is the default. Imagery is always generated —
 * never TasteAtlas photography (copyright).
 */
export const UMAMI_STYLE_TEMPLATES: StyleTemplate[] = [
  {
    label: 'Warm flat illustration',
    stylePrefix:
      'Warm flat-design editorial food illustration, matte gouache texture, soft cream background, terracotta sage and mustard-gold palette, hand-drawn organic shapes, cozy and appetizing, no text',
  },
  {
    label: 'Spice market (dark)',
    stylePrefix:
      'Moody dark editorial food illustration, deep umber background, glowing turmeric-orange highlights, spice-market atmosphere, rich warm tones, painterly texture, no text',
  },
  {
    label: 'Ingredient study',
    stylePrefix:
      'Botanical-plate style illustration of a single food ingredient, centered composition, generous negative space, delicate linework with warm flat color fills, no text',
  },
  {
    label: 'Steam & bowls',
    stylePrefix:
      'Overhead flat-lay illustration of a steaming dish in a ceramic bowl, rising steam as elegant linework, warm earthy palette, appetizing editorial style, no text',
  },
  {
    label: 'Paper cutout',
    stylePrefix:
      'Layered paper-cutout collage illustration of food, torn-edge textures, warm cream terracotta and sage paper tones, soft drop shadows, no text',
  },
]
