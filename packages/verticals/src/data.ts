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

/**
 * Map a story's `vertical:` frontmatter to the consumer **app** slug whose
 * render surface owns it. The vertical slug and the app slug differ in general
 * (the `f1` vertical renders on the `vizf1` app); verticals with no consumer
 * app (kidzovo, starship) and stories with no vertical at all are vizmaya's
 * own — they render on `vizmaya-fyi`.
 */
export function appSlugForVertical(vertical?: string | null): string {
  if (!vertical) return 'vizmaya-fyi'
  const v = VERTICAL_BY_SLUG.get(vertical)
  return v?.publicRoutes?.appSlug ?? 'vizmaya-fyi'
}

/* ────────────────────────────────────────────────────────────────────────
 * App registry
 *
 * The companion to `VERTICALS`: one declarative entry per consumer **app**
 * (vizmaya-fyi, footshorts, vizf1, …). A vertical renders *under* an app
 * (`publicRoutes.appSlug` is the link); this registry owns everything about
 * the app itself that used to be smeared across `apps/admin/lib/publicSite.ts`
 * and a fistful of `NEXT_PUBLIC_*` env vars:
 *
 *   (a) URLs        — render-surface origin, consumer base, admin origin
 *   (b) branding    — logo, brand fonts, theme defaults, autoplay logo policy
 *   (c) surfaces    — which of share/report/slides/autoplay the app exposes
 *                     and the CI workflow + storage bucket each dispatches to
 *   (d) routing     — story / epic path shapes on the consumer app
 *
 * The render-surface origin is the seam the render-engine extraction (roadmap
 * ⑧ / option C, docs/vertical-registration-drift.md) hangs off: every app's
 * `renderSurface` defaults to https://vizmaya.fyi today (the one headless
 * render surface every vertical iframes into) and is flipped to the neutral
 * `apps/render` service one app/surface at a time via its env override.
 *
 * Each URL is declared as an `{ env, default }` pair rather than resolved
 * eagerly, because how it resolves depends on the caller:
 *   - render-surface + admin origins are read **server-side only** (URL signing,
 *     CI dispatch, CORS), so `resolveAppUrls()` resolves them with a dynamic
 *     `process.env[env]` read — fine on the server.
 *   - consumer base URLs are also read **client-side** (cross-app preview links),
 *     where Next only inlines a *statically* referenced `process.env.NEXT_PUBLIC_*`.
 *     Those stay declared as static reads in `publicSite.ts`; the metadata here
 *     mirrors them for server callers and documentation. Do NOT resolve a
 *     `NEXT_PUBLIC_*` consumer URL through `resolveAppUrls()` in client code.
 * ──────────────────────────────────────────────────────────────────────── */

/** An env-overridable URL: the env var name to read and the production default. */
export interface AppUrl {
  env: string
  default: string
}

export interface AppUrls {
  /** Where this app's headless render surface (share/report/slides/autoplay/
   *  canvas-frame) is served. Server-resolved. Defaults to vizmaya.fyi until
   *  the strangler flips it to the neutral render service. */
  renderSurface: AppUrl
  /** Public consumer base (where the app's own reader/landing lives). */
  consumer: AppUrl
  /** Admin origin for this app, for the cross-origin `/api/*` CORS allow-list. */
  admin: AppUrl
}

export interface AppBranding {
  /** Inline logo SVG, re-tinted per theme by the render surface. */
  logoSvg?: string
  /** Brand font family overrides applied to share cards (replaces the old
   *  per-vertical `applyShareBrandFonts` special-case). */
  brandFonts?: { serif?: string; sans?: string; mono?: string }
  /** Default theme token overrides for this app. */
  themeDefaults?: Record<string, unknown>
  /** Suppress the render surface's own logo during autoplay (verticals bring
   *  their own brand chrome). */
  hideLogoInAutoplay: boolean
  /** Embed-mode chrome toggles for the consumer iframe. */
  embedChrome?: { backButton?: boolean; logo?: boolean }
  /** The `[data-vertical]` hook surface CSS keys off (e.g. footshorts share). */
  dataAttr?: string
}

/** Dispatch target for a heavy (CI-rendered) surface. */
export interface SurfaceDispatch {
  workflow: string
  bucket: string
}

export interface AppSurfaces {
  share: boolean
  report: boolean
  slides: boolean
  autoplay: boolean
  dispatch?: {
    pdf?: SurfaceDispatch
    video?: SurfaceDispatch
    audio?: SurfaceDispatch
  }
}

export interface AppRouting {
  /** Path for a story on the consumer app, or omitted if it has no story route. */
  storyPath?: (slug: string) => string
  /** Path for an epic landing on the consumer app, or omitted if it has none. */
  epicPath?: (slug: string) => string
}

export interface AppEntry {
  /** App slug — the `APP_PUBLIC_ROUTES` key, and the value
   *  `appSlugForVertical()` resolves a story's vertical to. */
  slug: string
  urls: AppUrls
  branding: AppBranding
  surfaces: AppSurfaces
  routing: AppRouting
}

const PDF_DISPATCH: SurfaceDispatch = { workflow: 'render-pdf.yml', bucket: 'story-pdf' }
const VIDEO_DISPATCH: SurfaceDispatch = { workflow: 'render-video.yml', bucket: 'story-video' }
const AUDIO_DISPATCH: SurfaceDispatch = { workflow: 'render-audio.yml', bucket: 'story-video' }
const ALL_SURFACES_DISPATCH = { pdf: PDF_DISPATCH, video: VIDEO_DISPATCH, audio: AUDIO_DISPATCH }

/**
 * Every consumer app. Order is stable. Stories with no consumer app
 * (kidzovo/starship internals, vizmaya's own) resolve to `vizmaya-fyi` via
 * `appSlugForVertical()`, so only apps that own a render surface need an entry.
 */
export const APPS: AppEntry[] = [
  {
    slug: 'vizmaya-fyi',
    urls: {
      renderSurface: { env: 'RENDER_SURFACE_URL_VIZMAYA', default: 'https://vizmaya.fyi' },
      consumer: { env: 'NEXT_PUBLIC_VIZMAYA_URL', default: 'https://vizmaya.fyi' },
      admin: { env: 'NEXT_PUBLIC_ADMIN_VIZMAYA_URL', default: 'https://admin.vizmaya.fyi' },
    },
    branding: { hideLogoInAutoplay: false, dataAttr: 'vizmaya' },
    surfaces: { share: true, report: true, slides: true, autoplay: true, dispatch: ALL_SURFACES_DISPATCH },
    // vizmaya.fyi is the base brand: stories at /story/<slug>, epics own a
    // top-level slug (each ships its own bespoke landing under app/<slug>/).
    routing: { storyPath: (slug) => `/story/${slug}`, epicPath: (slug) => `/${slug}` },
  },
  {
    slug: 'footshorts',
    urls: {
      renderSurface: { env: 'RENDER_SURFACE_URL_FOOTSHORTS', default: 'https://vizmaya.fyi' },
      consumer: { env: 'NEXT_PUBLIC_FOOTSHORTS_URL', default: 'https://footshorts.com' },
      admin: { env: 'NEXT_PUBLIC_ADMIN_FOOTSHORTS_URL', default: 'https://admin.footshorts.com' },
    },
    branding: {
      hideLogoInAutoplay: true,
      dataAttr: 'footshorts',
      // footshorts brand type families, per its `type-display` guideline:
      // Forum (editorial display serif), Manrope (UI/body), Space Mono
      // (numbers/scores/timers/@handles). Drives `applyShareBrandFonts` so
      // every footshorts share card adopts these while keeping story colours.
      brandFonts: { serif: 'Forum', sans: 'Manrope', mono: 'Space Mono' },
    },
    surfaces: { share: true, report: true, slides: true, autoplay: true, dispatch: ALL_SURFACES_DISPATCH },
    routing: { storyPath: (slug) => `/editorial/${slug}`, epicPath: (slug) => `/editorial/epic/${slug}` },
  },
  {
    slug: 'vizf1',
    urls: {
      renderSurface: { env: 'RENDER_SURFACE_URL_VIZF1', default: 'https://vizmaya.fyi' },
      consumer: { env: 'NEXT_PUBLIC_VIZF1_URL', default: 'https://vizf1.com' },
      admin: { env: 'NEXT_PUBLIC_ADMIN_VIZF1_URL', default: 'https://admin.vizf1.com' },
    },
    branding: { hideLogoInAutoplay: true, dataAttr: 'vizf1' },
    // vizf1 has no epic landing route.
    surfaces: { share: true, report: true, slides: true, autoplay: true, dispatch: ALL_SURFACES_DISPATCH },
    routing: { storyPath: (slug) => `/editorial/${slug}` },
  },
]

/** Lookup by app slug. */
export const APP_BY_SLUG: Map<string, AppEntry> = new Map(APPS.map((a) => [a.slug, a]))

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '')
}

/** Resolve an `{ env, default }` URL declaration against `process.env`. */
function resolveUrl(u: AppUrl): string {
  return normalizeUrl(process.env[u.env] || u.default)
}

/**
 * Resolve an app's URLs against the current environment. **Server-only** for
 * the consumer URL (it may be a `NEXT_PUBLIC_*` var that only inlines via a
 * static read client-side — see the registry header). The render-surface and
 * admin URLs are server-only by nature (signing, dispatch, CORS). Falls back to
 * the `vizmaya-fyi` entry for an unknown slug so callers always get a base.
 */
export function resolveAppUrls(slug: string): {
  renderSurfaceUrl: string
  consumerUrl: string
  adminUrl: string
} {
  const app = APP_BY_SLUG.get(slug) ?? APP_BY_SLUG.get('vizmaya-fyi')!
  return {
    renderSurfaceUrl: resolveUrl(app.urls.renderSurface),
    consumerUrl: resolveUrl(app.urls.consumer),
    adminUrl: resolveUrl(app.urls.admin),
  }
}

/**
 * The five headless render surfaces, in the order the render-engine extraction
 * repoints them off vizmaya.fyi onto the neutral `apps/render` service.
 */
export type RenderSurfaceKind =
  | 'canvasFrame'
  | 'share'
  | 'slides'
  | 'report'
  | 'autoplay'

/** Per-surface env override — the strangler's flip knob, one per surface. */
const RENDER_SURFACE_ENV: Record<RenderSurfaceKind, string> = {
  canvasFrame: 'RENDER_SURFACE_URL_CANVAS_FRAME',
  share: 'RENDER_SURFACE_URL_SHARE',
  slides: 'RENDER_SURFACE_URL_SLIDES',
  report: 'RENDER_SURFACE_URL_REPORT',
  autoplay: 'RENDER_SURFACE_URL_AUTOPLAY',
}

/**
 * Render-surface origin for one surface of a story. **Server-only** (URL
 * signing / CI dispatch). Resolved in order:
 *   1. `RENDER_SURFACE_URL_<SURFACE>` — the strangler knob. Set it to the
 *      apps/render origin to flip that one surface off vizmaya.fyi; unset
 *      surfaces keep rendering on the live vizmaya.fyi fallback, so surfaces
 *      move one at a time and each is independently revertable (unset the env).
 *   2. the owning app's render surface (`RENDER_SURFACE_URL_<APP>` or default),
 *      so a single app (e.g. footshorts) can be flipped independently.
 *   3. `https://vizmaya.fyi` (the app default).
 *
 * Behaviour-neutral until one of the envs above is set.
 */
export function renderSurfaceUrl(
  surface: RenderSurfaceKind,
  vertical?: string | null
): string {
  const perSurface = process.env[RENDER_SURFACE_ENV[surface]]
  if (perSurface) return normalizeUrl(perSurface)
  return resolveAppUrls(appSlugForVertical(vertical)).renderSurfaceUrl
}
