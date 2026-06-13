/**
 * Vertical registry — the single declarative source of truth for the verticals
 * the engine can render.
 *
 * Background: `vizmaya-fyi` is both the vizmaya.fyi consumer brand AND the
 * universal headless render surface every vertical iframes into. The
 * per-vertical wiring that makes that work used to be hand-copied across many
 * uncoordinated sites (client `VerticalLoader`s in vizmaya-fyi/admin/catalog,
 * the admin server-side `vizmayaModuleTypes`, the catalog API + preview
 * components, and the Tailwind `@source` blocks), so the lists silently drifted
 * — a vertical's modules would break in some surfaces but not others, with no
 * build error. See docs/vertical-registration-drift.md.
 *
 * This module collapses all of that into one array. The rule going forward is:
 * **adding a vertical = adding one `VerticalEntry` here.** Nothing else gets
 * hand-edited.
 *
 * Why a dedicated `@vismay/verticals` package (not inside `@vismay/viz-engine`):
 * each vertical viz package (`@vismay/<x>-viz`) depends on `viz-engine`, so the
 * engine cannot statically reference them back without forming a build-graph
 * cycle — and under pnpm's strict layout they aren't even resolvable from
 * inside the engine. This package sits ABOVE the viz packages in the dependency
 * graph (it depends on all of them), so the `loadBundle` thunks resolve here and
 * the graph stays a DAG: verticals → <x>-viz → viz-engine.
 *
 * This `data` module is import-safe everywhere — it pulls in NO viz-engine or
 * vertical viz code at module-evaluation time. Each `loadBundle` is a
 * `() => import(...)` thunk evaluated lazily by `loadVertical`, and the bundle
 * specifiers stay static so pnpm/Turbo/webpack resolution is unchanged. Keeping
 * the data here (separate from `index.ts`, which imports viz-engine for the
 * registration helper) lets server-only callers like admin's `publicSite`
 * consume the route metadata via `@vismay/verticals/data` without dragging the
 * engine's heavy deps (deck.gl / mapbox / echarts) into their bundle.
 *
 * The Tailwind `@source` partials are generated from `tailwindSources` by
 * `scripts/gen-tailwind-sources.ts` (run via `pnpm gen:sources`).
 */

/**
 * Public consumer routing for a vertical. Folds the per-app entries that used
 * to live in `apps/admin/lib/publicSite.ts` (`APP_PUBLIC_ROUTES`). The base
 * URL (env-overridable hostname) stays resolved in `publicSite.ts`; only the
 * path *shapes* live here, keyed by the consumer **app** slug they belong to.
 */
export interface VerticalPublicRoutes {
  /** Consumer app slug this vertical's stories render under (the
   *  `APP_PUBLIC_ROUTES` key in publicSite). May differ from the vertical
   *  slug — e.g. the `f1` vertical renders on the `vizf1` app. */
  appSlug: string
  /** Path for a story on the consumer app, or omitted if it has no story route. */
  storyPath?: (slug: string) => string
  /** Path for an epic landing on the consumer app, or omitted if it has none. */
  epicPath?: (slug: string) => string
}

export interface VerticalEntry {
  /** Vertical slug, matching a story's `vertical:` frontmatter. */
  slug: string
  /**
   * Lazily import the vertical's viz bundle. Kept as a `() => import()` thunk
   * with a static specifier so workspace resolution + bundling are unchanged
   * and no vertical code is pulled in at registry-import time. The resolved
   * module exposes `register()`, which `registerVizModule()`s each of the
   * vertical's modules.
   */
  loadBundle: () => Promise<{ register: () => void | Promise<void> }>
  /** Repo-relative source globs for Tailwind `@source` generation. */
  tailwindSources: string[]
  /** Public consumer routing, when this vertical has a consumer app. */
  publicRoutes?: VerticalPublicRoutes
}

/**
 * Every vertical the engine knows about. Order is stable for deterministic
 * `@source` generation (CI runs `pnpm gen:sources && git diff --exit-code`).
 */
export const VERTICALS: VerticalEntry[] = [
  {
    slug: 'footshorts',
    loadBundle: () => import('@vismay/footshorts-viz'),
    tailwindSources: ['verticals/footshorts-viz/src/**/*.{ts,tsx}'],
    publicRoutes: {
      appSlug: 'footshorts',
      storyPath: (slug) => `/editorial/${slug}`,
      epicPath: (slug) => `/editorial/epic/${slug}`,
    },
  },
  {
    slug: 'f1',
    loadBundle: () => import('@vismay/f1-viz'),
    tailwindSources: ['verticals/f1-viz/src/**/*.{ts,tsx}'],
    publicRoutes: {
      appSlug: 'vizf1',
      storyPath: (slug) => `/editorial/${slug}`,
      // vizf1 has no epic landing route.
    },
  },
  {
    slug: 'kidzovo',
    loadBundle: () => import('@vismay/kidzovo-viz'),
    tailwindSources: ['verticals/kidzovo-viz/src/**/*.{ts,tsx}'],
  },
  {
    slug: 'starship',
    loadBundle: () => import('@vismay/starship-viz'),
    tailwindSources: ['verticals/starship-viz/src/**/*.{ts,tsx}'],
  },
]

/** Lookup by slug, for callers that need a single entry. */
export const VERTICAL_BY_SLUG: Map<string, VerticalEntry> = new Map(
  VERTICALS.map((v) => [v.slug, v])
)
