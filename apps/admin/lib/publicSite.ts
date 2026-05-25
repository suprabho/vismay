/**
 * Public base URLs of the consumer TLDs. Admin always runs on vismay.xyz, so
 * every cross-app link has to be absolute — a bare `/story/...` would 404
 * against the admin host.
 *
 * Each base URL is env-overridable (with `NEXT_PUBLIC_` so it's also readable
 * client-side) and falls back to the canonical production hostname. Local dev
 * against a Next port works by setting the env in `.env.local`.
 */
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
 * Keep this in lockstep with the consumer apps' routes:
 *   apps/footshorts/web/app/editorial/[slug]/         (story reader)
 *   apps/footshorts/web/app/editorial/epic/[slug]/    (epic landing)
 *   apps/vizf1/web/app/editorial/[slug]/             (story reader)
 */
interface AppPublicRoutes {
  baseUrl: string
  storyPath: ((slug: string) => string) | null
  epicPath: ((slug: string) => string) | null
}

const APP_PUBLIC_ROUTES: Record<string, AppPublicRoutes> = {
  'vizmaya-fyi': {
    baseUrl: vizmayaPublicUrl,
    storyPath: (slug) => `/story/${slug}`,
    epicPath: (slug) => `/epic/${slug}`,
  },
  vizf1: {
    baseUrl: vizf1PublicUrl,
    storyPath: (slug) => `/editorial/${slug}`,
    epicPath: null,
  },
  footshorts: {
    baseUrl: footshortsPublicUrl,
    storyPath: (slug) => `/editorial/${slug}`,
    epicPath: (slug) => `/editorial/epic/${slug}`,
  },
}

/** Public URL for a story in the given consumer app, or null if the app
 *  doesn't render stories (unknown appSlug). */
export function appStoryUrl(appSlug: string, slug: string): string | null {
  const routes = APP_PUBLIC_ROUTES[appSlug]
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
