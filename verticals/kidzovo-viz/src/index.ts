/**
 * Kidzovo vertical — bundle of viz types for kids' story scrollytelling.
 *
 * Engine boot calls this `register()` once when a story's frontmatter
 * declares `vertical: 'kidzovo'`. Each concrete module (kz:character,
 * kz:bubble, …) is dynamic-imported and handed to `registerVizModule`
 * so vizmaya.fyi (and any app that doesn't render Kidzovo stories)
 * tree-shakes them out of the bundle.
 *
 * Phase 1 registers the `kz-storybook` foreground layout — four regions
 * (background, stage, bubbles, caption) that every Kidzovo panel composes.
 * No viz modules yet; the layout's `kz:character` / `kz:bubble` slots are
 * declared in `accepts` ahead of phases 2–3. See
 * docs/kidzovo-vertical-plan.md for the full phase breakdown.
 */

import { registerForegroundLayout } from '@vismay/viz-engine'

import { kzStorybook } from './layouts/kz-storybook'

export async function register(): Promise<void> {
  registerForegroundLayout(kzStorybook)
  // TODO(kidzovo-scaffold): parallel dynamic-import + registerVizModule for
  // ./modules/character (phase 2) and ./modules/bubble (phase 3).
  // eslint-disable-next-line no-console
  console.log('[kidzovo-viz] registered')
}
