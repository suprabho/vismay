/**
 * Public base URLs of the consumer TLDs. Admin always runs on vismay.xyz, so
 * every cross-app link has to be absolute — a bare `/story/...` would 404
 * against the admin host.
 *
 * Each base URL is env-overridable (with `NEXT_PUBLIC_` so it's also readable
 * client-side) and falls back to the canonical production hostname. Local dev
 * against a Next port works by setting the env in `.env.local`.
 */
// Import the pure `/data` subpath (NOT the `@vismay/verticals` barrel) on
// purpose: publicSite is imported by the admin node middleware, and the barrel
// re-exports `registerAllVerticals`, which pulls in the viz-engine barrel
// (deck.gl / mapbox / echarts). `/data` is route metadata + lazy import thunks
// only, so this stays lean.
import { VERTICALS } from '@vismay/verticals/data'

function normalize(url: string): string {
  return url.replace(/\/$/, '')
}

export const vizmayaPublicUrl: string = normalize(
  process.env.NEXT_PUBLIC_VIZMAYA_URL || 'https://vizmaya.fyi'
)
export const vizf1PublicUrl: string = normalize(
  process.env.NEXT_PUBLIC_VIZF1_URL || 'https://vizf1.com'
)
export const footshortsPublicUrl: string = normalize(
  process.env.NEXT_PUBLIC_FOOTSHORTS_URL || 'https://footshorts.com'
)

/**
 * Per-vertical admin origins. Admin is reachable on its own subdomain of each
 * consumer TLD (admin.vizmaya.fyi, admin.footshorts.com, admin.vizf1.com) in
 * addition to the vismay.xyz family. These are trusted admin surfaces, listed
 * here so the middleware CORS allow-list accepts a cross-origin admin `/api/*`
 * call between them. Env-overridable for staging hosts.
 */
export const adminVizmayaUrl: string = normalize(
  process.env.NEXT_PUBLIC_ADMIN_VIZMAYA_URL || 'https://admin.vizmaya.fyi'
)
export const adminFootshortsUrl: string = normalize(
  process.env.NEXT_PUBLIC_ADMIN_FOOTSHORTS_URL || 'https://admin.footshorts.com'
)
export const adminVizf1Url: string = normalize(
  process.env.NEXT_PUBLIC_ADMIN_VIZF1_URL || 'https://admin.vizf1.com'
)

/** All per-vertical admin origins, for the CORS allow-list. */
export const adminPublicOrigins: string[] = [
  adminVizmayaUrl,
  adminFootshortsUrl,
  adminVizf1Url,
]

/**
 * Return both the apex and `www.` variants of a base URL.
 *
 * Vercel's default redirect rules send the apex (`vizmaya.fyi`) to the `www`
 * subdomain (or vice versa), and the redirected origin is what the browser
 * actually sends in the `Origin` header — which means admin's CORS allowlist
 * has to accept both even though signing/linking only uses the canonical one.
 * Preflight requests can't follow redirects, so a mismatch surfaces as
 * "Redirect is not allowed for a preflight request" instead of a useful 401.
 *
 * For unparseable inputs we fall back to the original string so callers don't
 * silently drop a configured URL.
 */
export function originVariants(url: string): string[] {
  try {
    const u = new URL(url)
    const host = u.hostname
    const apex = host.startsWith('www.') ? host.slice(4) : host
    const www = `www.${apex}`
    return [`${u.protocol}//${apex}`, `${u.protocol}//${www}`]
  } catch {
    return [url]
  }
}

export function vizmayaUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${vizmayaPublicUrl}${normalized}`
}

/**
 * Per-app preview routing. Stories on vizf1/footshorts render via the
 * consumer app's own `/editorial/<slug>` route (which iframes vizmaya.fyi's
 * source render), not via vizmaya.fyi directly — opening the consumer URL
 * is what admins actually want to see. Epics on footshorts have a bespoke
 * landing at `/editorial/epic/<slug>`; vizf1 has no epic route at all.
 *
 * On vizmaya.fyi epics own their own top-level slug (each epic ships its
 * own bespoke landing under `apps/vizmaya-fyi/app/<slug>/`), so the preview
 * URL is just `/<slug>` — there is no `/epic/...` segment.
 *
 * Keep this in lockstep with the consumer apps' routes:
 *   apps/vizmaya-fyi/app/<slug>/                      (epic landing — bespoke per epic)
 *   apps/vizmaya-fyi/app/story/[slug]/                (story reader)
 *   apps/footshorts/web/app/editorial/[slug]/         (story reader)
 *   apps/footshorts/web/app/editorial/epic/[slug]/    (epic landing)
 *   apps/vizf1/web/app/editorial/[slug]/             (story reader)
 */
interface AppPublicRoutes {
  baseUrl: string
  storyPath: ((slug: string) => string) | null
  epicPath: ((slug: string) => string) | null
}

// Base brand. vizmaya.fyi is NOT a vertical (it's the headless render surface
// itself), so its routing lives here rather than in the registry: stories at
// /story/<slug>, epics own a top-level slug.
const APP_PUBLIC_ROUTES: Record<string, AppPublicRoutes> = {
  'vizmaya-fyi': {
    baseUrl: vizmayaPublicUrl,
    storyPath: (slug) => `/story/${slug}`,
    epicPath: (slug) => `/${slug}`,
  },
}

// Per-vertical consumer routing comes from the registry (the single source of
// truth — see packages/viz-engine/src/verticalRegistry.ts). Only the path
// *shapes* live there; the base URL stays an app-routing concern resolved here
// (env-overridable hostname), keyed by the consumer app slug.
const VERTICAL_APP_BASE_URLS: Record<string, string> = {
  footshorts: footshortsPublicUrl,
  vizf1: vizf1PublicUrl,
}
for (const v of VERTICALS) {
  const routes = v.publicRoutes
  if (!routes) continue
  APP_PUBLIC_ROUTES[routes.appSlug] = {
    baseUrl: VERTICAL_APP_BASE_URLS[routes.appSlug] ?? vizmayaPublicUrl,
    storyPath: routes.storyPath ?? null,
    epicPath: routes.epicPath ?? null,
  }
}

/** Public URL for a story in the given consumer app, or null if the app
 *  doesn't render stories (unknown appSlug). */
export function appStoryUrl(appSlug: string | null, slug: string): string | null {
  const routes = appSlug ? APP_PUBLIC_ROUTES[appSlug] : undefined
  if (!routes || !routes.storyPath) return null
  return `${routes.baseUrl}${routes.storyPath(slug)}`
}

/** Public URL for an epic in the given consumer app, or null if the app
 *  has no epic landing (e.g. vizf1) or appSlug is unknown. */
export function appEpicUrl(appSlug: string, slug: string): string | null {
  const routes = APP_PUBLIC_ROUTES[appSlug]
  if (!routes || !routes.epicPath) return null
  return `${routes.baseUrl}${routes.epicPath(slug)}`
}
