/**
 * Each app's house look for HTML stories: the palette the brief hands an agent
 * when no other style is picked (and that ./brief's HOUSE_STYLE prose spells
 * out), and its font trio. Pure, so the admin's style editor can start from
 * the house look without importing the brief.
 */

import type { HtmlStoryApp } from './apps'
import type { ThemeColors } from './meta'
import type { StyleFonts, StylePalette } from './styles'

/** The vizmaya house palette: the story reader's defaults. */
const VIZMAYA_PALETTE: ThemeColors = {
  background: '#0a0e14',
  surface: '#111820',
  text: '#e0ddd5',
  muted: '#5a6a70',
  line: '#1a2830',
  accent: '#D85A30',
  accent2: '#534AB7',
  teal: '#1D9E75',
}

/**
 * The footshorts house palette: the app's `classic` theme
 * (apps/footshorts/brand/src/themes/classic.ts). Brand orange-red is the
 * accent, the deeper brand red (the `terrace` theme's) the secondary, and the
 * app's green "live" pop the tertiary.
 */
const FOOTSHORTS_PALETTE: ThemeColors = {
  background: '#0B0B0F',
  surface: '#16161D',
  text: '#F4F4F5',
  muted: '#8E8E99',
  line: '#24242E',
  accent: '#F26A3C',
  accent2: '#C2410C',
  teal: '#00D26A',
}

/**
 * The vizf1 house palette: the app's own (@vizf1/brand `F1_BRAND.colors`) as
 * the Paddock story theme carries it (packages/viz-engine themeDefaults). Coral
 * red is the accent; purple and teal follow the timing screens' own meaning.
 */
const VIZF1_PALETTE: ThemeColors = {
  background: '#0b0d12',
  surface: '#13161d',
  text: '#f5f5f5',
  muted: '#8e8e99',
  line: '#1f2330',
  accent: '#ff4346',
  accent2: '#A855F7',
  teal: '#2DD4BF',
}

/**
 * The viznba house palette: the app's own (apps/viznba/web/app/globals.css).
 * The brand orange is the accent; the live red (the app's score bug) the
 * secondary, kept for what is happening now or went wrong; a court teal the
 * tertiary.
 */
const VIZNBA_PALETTE: ThemeColors = {
  background: '#0b0d12',
  surface: '#13161d',
  text: '#f5f5f5',
  muted: '#8e8e99',
  line: '#1f2330',
  accent: '#ff8a3d',
  accent2: '#ff4d4f',
  teal: '#2DD4BF',
}

/**
 * The travel house palette: the scrapbook story's paper
 * (apps/travel/web/content/stories/*.md themes, the trip pages' header).
 * Terracotta is the accent, a postbox blue the secondary, a park green the
 * tertiary.
 */
const TRAVEL_PALETTE: ThemeColors = {
  background: '#f6f1e7',
  surface: '#fffdf8',
  text: '#2b2419',
  muted: '#8a8172',
  line: '#e2d9c8',
  accent: '#c94f2c',
  accent2: '#2c6bc9',
  teal: '#2ca089',
}

export const HOUSE_PALETTES: Record<HtmlStoryApp, ThemeColors> = {
  'vizmaya-fyi': VIZMAYA_PALETTE,
  footshorts: FOOTSHORTS_PALETTE,
  vizf1: VIZF1_PALETTE,
  viznba: VIZNBA_PALETTE,
  travel: TRAVEL_PALETTE,
}

/** The house font trio per app: headlines, body, labels and data. */
export const HOUSE_FONTS: Record<HtmlStoryApp, StyleFonts> = {
  'vizmaya-fyi': { serif: 'Fraunces', sans: 'Inter', mono: 'JetBrains Mono' },
  footshorts: { serif: 'Forum', sans: 'Space Grotesk', mono: 'Space Mono' },
  vizf1: { serif: 'Saira', sans: 'Saira', mono: 'Martian Mono' },
  viznba: { serif: 'Saira', sans: 'Saira', mono: 'Martian Mono' },
  travel: { serif: 'Lora', sans: 'Manrope', mono: 'Space Mono' },
}

/** The house palette and fonts as one style, the starting point for an edit. */
export function houseStyle(app: HtmlStoryApp): { palette: StylePalette; fonts: StyleFonts } {
  return { palette: HOUSE_PALETTES[app] as StylePalette, fonts: HOUSE_FONTS[app] }
}
