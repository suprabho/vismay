/**
 * Travel vertical — viz modules for trip scrapbook stories.
 *
 * Engine boot calls this `register()` once when a story's frontmatter
 * declares `vertical: 'travel'`. Each concrete module is dynamic-imported
 * and handed to `registerVizModule` so apps that never render travel
 * stories tree-shake them out of the bundle.
 *
 * Modules:
 *   - travel:polaroid   — photo in a white matte, handwritten caption, tape
 *   - travel:tapeNote   — handwritten note on a paper scrap
 *   - travel:ticket     — perforated admission/order stub
 *   - travel:photoStack — fanned pile of matted photos (+ "N more" tab)
 *   - travel:postmark   — circular rubber-stamp time/place anchor
 *   - travel:prefetch   — invisible next-spread image warmer
 *
 * Layouts (registerScrapbookLayouts): travel:spread-left / spread-right /
 * spread-hero / spread-center — paper artifacts positioned over the live map.
 */

import { registerVizModule } from '@vismay/viz-engine'
import { registerScrapbookLayouts } from './layouts'

export async function register(): Promise<void> {
  const [polaroid, tapeNote, ticket, photoStack, postmark, prefetch] = await Promise.all([
    import('./modules/polaroid'),
    import('./modules/tapeNote'),
    import('./modules/ticket'),
    import('./modules/photoStack'),
    import('./modules/postmark'),
    import('./modules/prefetch'),
  ])
  registerVizModule(polaroid.default)
  registerVizModule(tapeNote.default)
  registerVizModule(ticket.default)
  registerVizModule(photoStack.default)
  registerVizModule(postmark.default)
  registerVizModule(prefetch.default)
  registerScrapbookLayouts()
  // eslint-disable-next-line no-console
  console.log('[travel-viz] registered')
}
