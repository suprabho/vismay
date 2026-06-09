import type { StoryFormat } from './types'

/**
 * A complete, neutral editorial theme. The engine injects this so the model
 * never has to author a full palette (and so every token the renderer reads is
 * present). The model may suggest accent colours, which `buildFrontmatter`
 * folds over this base.
 */
export const DEFAULT_THEME = {
  colors: {
    background: '#f6f4ef',
    text: '#1a1c22',
    accent: '#2f4b7c',
    accent2: '#d4612a',
    teal: '#2a9d8f',
    surface: '#ffffff',
    muted: '#6b7280',
    positive: '#2a9d8f',
    amber: '#e0a13c',
    red: '#c0432f',
    line: '#e2ddd3',
  },
  fonts: {
    serif: 'Fraunces',
    sans: 'Inter',
    mono: 'JetBrains Mono',
  },
} as const

/**
 * Story-wide `defaults` for the config.yaml, per format. Deliberately
 * conservative so a freshly generated story renders without missing assets:
 * the deck background is a flat theme colour (no aura slug to resolve), map
 * sections carry their own cameras.
 */
export function defaultsFor(format: StoryFormat): Record<string, unknown> {
  if (format === 'map') {
    return {
      scroll: { mode: 'continuous' },
      chart: { theme: 'light-editorial' },
      // Declare the map look explicitly (instead of relying on renderer
      // fallbacks): a light basemap that matches the editorial theme, dimmed so
      // overlays read, with accent-coloured pins.
      mapStyle: 'mapbox://styles/mapbox/light-v11',
      mapOpacity: 0.6,
      pinColor: DEFAULT_THEME.colors.accent2,
      pinRadius: 8,
      flySpeed: 1.2,
    }
  }
  return {
    storyBackground: { type: 'color', value: DEFAULT_THEME.colors.background, fixed: true },
    overlay: { color: 'transparent', opacity: 0 },
    panel: { background: 'transparent', border: 'none' },
    scroll: { mode: 'snap', paddingY: '12vh' },
    chart: { theme: 'light-editorial' },
    progress: true,
  }
}
