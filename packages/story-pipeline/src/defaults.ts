// Deep imports (not the `@vismay/viz-engine` barrel): this package typechecks
// standalone without JSX, so it must never pull the engine's .tsx modules.
import type { Theme } from '@vismay/viz-engine/src/types/story'
import { DEFAULT_THEME, isDarkTheme } from '@vismay/viz-engine/src/lib/themeDefaults'
import type { StoryFormat } from './types'

/**
 * The neutral editorial base theme now lives in the engine
 * (`@vismay/viz-engine` → lib/themeDefaults) so content-source can validate
 * saved themes against it without a dependency cycle. Re-exported here so
 * existing `@vismay/story-pipeline` importers keep working.
 */
export { DEFAULT_THEME }

/**
 * Story-wide `defaults` for the config.yaml, per format. Deliberately
 * conservative so a freshly generated story renders without missing assets:
 * the deck background is a flat theme colour (no aura slug to resolve), map
 * sections carry their own cameras.
 *
 * `theme` is the story's seed theme (an app's default preset, or
 * `DEFAULT_THEME`): the deck backdrop, map pin colour and basemap follow it so
 * a dark-app story (footshorts, vizf1) doesn't open on a cream deck or a light
 * basemap.
 */
export function defaultsFor(format: StoryFormat, theme: Theme = DEFAULT_THEME): Record<string, unknown> {
  const dark = isDarkTheme(theme)
  if (format === 'map') {
    return {
      scroll: { mode: 'continuous' },
      chart: { theme: 'light-editorial' },
      // Declare the map look explicitly (instead of relying on renderer
      // fallbacks): a basemap that matches the theme's scheme, dimmed so
      // overlays read, with accent-coloured pins.
      mapStyle: dark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      mapOpacity: 0.6,
      pinColor: theme.colors.accent2,
      pinRadius: 8,
      flySpeed: 1.2,
    }
  }
  return {
    storyBackground: { type: 'color', value: theme.colors.background, fixed: true },
    overlay: { color: 'transparent', opacity: 0 },
    panel: { background: 'transparent', border: 'none' },
    scroll: { mode: 'snap', paddingY: '12vh' },
    chart: { theme: 'light-editorial' },
    progress: true,
  }
}
