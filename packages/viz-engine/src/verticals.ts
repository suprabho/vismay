/**
 * Vertical plugin barrel — server-only.
 *
 * The Vismay engine ships a small core registry (chart, map, image, video,
 * rive, embed) that covers vizmaya.fyi's editorial vocabulary. Other
 * verticals — Footshort (football), F1, Cricket, etc. — extend the registry
 * with their own viz types (match cards, telemetry overlays, lap charts, …).
 *
 * Each vertical owns a folder under `components/story/viz/verticals/<slug>/`
 * and exports a `register(): Promise<void>` from its `index.ts`. The
 * registration function dynamic-imports the vertical's modules and calls
 * `registerVizModule()` for each.
 *
 * Routing:
 *   - The story's frontmatter declares `vertical: 'footshort'` (etc.). When
 *     `app/story/[slug]/page.tsx` resolves the story, it looks up the
 *     vertical and invokes `loadVertical(vertical)` once per process.
 *   - `loadVertical` is idempotent — repeat calls reuse the cached promise.
 *   - Verticals never auto-register at module-evaluation time, so a story
 *     that doesn't reference Footshort never pulls Footshort's modules into
 *     the SSG client bundle.
 *
 * Adding a new vertical:
 *   1. Create `components/story/viz/verticals/<slug>/index.ts`.
 *   2. Export `register(): Promise<void>` that imports each module and
 *      calls `registerVizModule(module)`.
 *   3. Add the slug to the `VERTICAL_LOADERS` map below.
 *   4. Stories opt in via `vertical: '<slug>'` in the frontmatter.
 */

type VerticalLoader = () => Promise<void>

/**
 * Static map of vertical → loader. Dynamic imports keep each vertical's
 * bundle out of the SSG client bundle for stories that don't reference it.
 *
 * Verticals that don't ship yet are commented out so a typo in YAML
 * frontmatter surfaces as a clean "unknown vertical" warning instead of a
 * module-not-found build failure.
 */
// Each vertical is its own workspace package. Engine does NOT declare them as
// dependencies — they'd create a circular workspace ref (each vertical
// depends on @vismay/viz-engine). The dynamic import resolves at runtime via
// the app's node_modules; the `@ts-expect-error` is required because engine
// has no type knowledge of the vertical package.
const VERTICAL_LOADERS: Record<string, VerticalLoader> = {
  footshort: () => import('@vismay/footshort-viz').then((m) => m.register()),
  // f1: () => import('@vismay/f1-viz').then((m) => m.register()),
  // cricket: () => import('@vismay/cricket-viz').then((m) => m.register()),
}

// One promise per vertical so concurrent loads dedupe and the second story
// referencing the same vertical pays nothing.
const loadingPromises = new Map<string, Promise<void>>()

/** Idempotently load and register a vertical's viz modules. */
export async function loadVertical(slug: string | undefined): Promise<void> {
  if (!slug) return
  const loader = VERTICAL_LOADERS[slug]
  if (!loader) {
    if (typeof console !== 'undefined') {
      console.warn(`[viz/verticals] unknown vertical '${slug}' — skipping`)
    }
    return
  }
  let p = loadingPromises.get(slug)
  if (!p) {
    p = loader()
    loadingPromises.set(slug, p)
  }
  return p
}

/** Test helper — clears the loaded-vertical cache so tests can re-init. */
export function _resetVerticalsForTesting(): void {
  loadingPromises.clear()
}
