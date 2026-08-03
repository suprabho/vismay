import type { Theme } from '@vismay/viz-engine'

/**
 * Umami "Social frames" palettes. Two switchable looks over the same semantic
 * tokens so `remapCompositionTheme` (../layers/retheme.ts) can flip a card
 * between them without losing hand-picked colors:
 *
 * - `paper`  — light cream editorial look matching the reference art
 *   (cream ground, terracotta / sage / gold accents).
 * - `spice`  — the dark spice-market palette of the umami consumer app
 *   (apps/umami/web/app/globals.css).
 *
 * Paired tokens deliberately keep identical hexes where the looks share a color
 * (sage accent2/positive, chili red) so the hex→token remap stays unambiguous.
 * Fonts are limited to families `getFontImports` knows; Forum ships weight 400
 * only, so seeds must never ask the serif for bold.
 */

export type UmamiThemeName = 'paper' | 'spice'

export const UMAMI_PAPER: Theme = {
  colors: {
    background: '#f6efe2',
    surface: '#efe4d0',
    text: '#2f2318',
    muted: '#8a7460',
    accent: '#c9642f',
    accent2: '#7d9c5c',
    teal: '#5f8a74',
    positive: '#7d9c5c',
    amber: '#d9a13a',
    red: '#c8452f',
    line: '#e4d6bc',
  },
  fonts: { serif: 'Forum', sans: 'Manrope', mono: 'Space Mono' },
}

export const UMAMI_SPICE: Theme = {
  colors: {
    background: '#171210',
    surface: '#221a15',
    text: '#f4ece1',
    muted: '#a5927f',
    accent: '#e07a2f',
    accent2: '#7d9c5c',
    teal: '#5f8a74',
    positive: '#7d9c5c',
    amber: '#d9a441',
    red: '#c8452f',
    line: '#3a2d22',
  },
  fonts: { serif: 'Forum', sans: 'Manrope', mono: 'Space Mono' },
}

export const UMAMI_THEMES: Record<UmamiThemeName, Theme> = {
  paper: UMAMI_PAPER,
  spice: UMAMI_SPICE,
}

/** Which umami look a theme's palette matches, if any (colors only — fonts may
 *  be tweaked independently). */
export function umamiThemeName(theme: Theme): UmamiThemeName | null {
  for (const name of ['paper', 'spice'] as const) {
    if (JSON.stringify(UMAMI_THEMES[name].colors) === JSON.stringify(theme.colors)) return name
  }
  return null
}
