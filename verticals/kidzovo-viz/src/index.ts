/**
 * Kidzovo vertical — bundle of viz types for kids' story scrollytelling.
 *
 * Engine boot calls this `register()` once when a story's frontmatter
 * declares `vertical: 'kidzovo'`. Each concrete module is dynamic-imported
 * and handed to `registerVizModule` so vizmaya.fyi (and any app that
 * doesn't render Kidzovo stories) tree-shakes them out of the bundle.
 *
 * Shipped so far:
 *   - phase 0: register() boundary + console log
 *   - phase 1: kz-storybook foreground layout
 *   - phase 2: kz:character module (one bundled character — Ovi)
 *
 * See docs/kidzovo-vertical-plan.md for the full phase breakdown.
 */

import { registerForegroundLayout, registerVizModule } from '@vismay/viz-engine'

import { kzStorybook } from './layouts/kz-storybook'

export async function register(): Promise<void> {
  registerForegroundLayout(kzStorybook)
  const [{ default: characterModule }] = await Promise.all([
    import('./modules/character'),
  ])
  registerVizModule(characterModule)
  // TODO(kidzovo-scaffold): add ./modules/bubble (phase 3).
  // eslint-disable-next-line no-console
  console.log('[kidzovo-viz] registered')
}
