/**
 * `@vismay/verticals` — the shared vertical registry.
 *
 * Re-exports the pure data (see ./data) plus `registerAllVerticals`, which
 * needs the engine's runtime registry. Server-only callers that want just the
 * route metadata (e.g. admin's publicSite) should import from
 * `@vismay/verticals/data` instead, to avoid pulling the viz-engine barrel.
 */

import { registerVerticalLoader } from '@vismay/viz-engine'
import { VERTICALS } from './data'

export * from './data'

/**
 * Register every vertical's loader with the engine. Replaces the loader lists
 * that were hand-maintained (and drifted) across the client `VerticalLoader`
 * components, the admin `ensureLoadersRegistered`, and the catalog API +
 * preview components. Idempotent — `registerVerticalLoader` just replaces the
 * entry on a repeat call, and the thunks are not evaluated until
 * `loadVertical(slug)` fires.
 */
export function registerAllVerticals(): void {
  for (const v of VERTICALS) {
    registerVerticalLoader(v.slug, () => v.loadBundle().then((m) => m.register()))
  }
}
