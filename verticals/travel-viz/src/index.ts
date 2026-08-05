/**
 * Travel vertical — viz modules for trip scrapbook stories.
 *
 * Engine boot calls this `register()` once when a story's frontmatter
 * declares `vertical: 'travel'`. Each concrete module is dynamic-imported
 * and handed to `registerVizModule` so apps that never render travel
 * stories tree-shake them out of the bundle.
 *
 * Shipped so far:
 *   - travel:polaroid — a photo in a white polaroid matte with a
 *     handwritten caption, optional rotation and masking tape. Composed
 *     into scrapbook sections via `layout: free` with per-layer
 *     `style.position` / `style.size`.
 */

import { registerVizModule } from '@vismay/viz-engine'

export async function register(): Promise<void> {
  const { default: polaroidModule } = await import('./modules/polaroid')
  registerVizModule(polaroidModule)
  // eslint-disable-next-line no-console
  console.log('[travel-viz] registered')
}
