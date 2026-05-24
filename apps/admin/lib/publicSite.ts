/**
 * Base URL of the public vizmaya.fyi site. Admin runs on its own domain
 * (admin.vizmaya.fyi in prod, a separate port in dev), so any link from admin
 * to a public-site route must be prefixed with this URL — a bare `/story/...`
 * would 404 against the admin domain.
 */
const FALLBACK = 'https://vizmaya.fyi'

export const vizmayaPublicUrl: string = (
  process.env.NEXT_PUBLIC_VIZMAYA_URL || FALLBACK
).replace(/\/$/, '')

export function vizmayaUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${vizmayaPublicUrl}${normalized}`
}

/**
 * Per-app preview routing. Stories on vizf1/footshort render via the
 * consumer app's own `/editorial/<slug>` route (which iframes vizmaya.fyi's
 * source render), not via vizmaya.fyi directly — opening the consumer URL
 * is what admins actually want to see. Epics on footshort have a bespoke
 * landing at `/editorial/epic/<slug>`; vizf1 has no epic route at all.
 *
 * Keep this in lockstep with the consumer apps' routes:
 *   apps/footshort/web/app/editorial/[slug]/         (story reader)
 *   apps/footshort/web/app/editorial/epic/[slug]/    (epic landing)
 *   apps/vizf1/web/app/editorial/[slug]/             (story reader)
 *
 * `vizmaya-fyi` keeps the env-overridable `vizmayaPublicUrl` so local dev
 * against a Next port still works. The consumer URLs are hardcoded — there
 * is no local-dev story for them yet.
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
    baseUrl: 'https://vizf1.com',
    storyPath: (slug) => `/editorial/${slug}`,
    epicPath: null,
  },
  footshort: {
    baseUrl: 'https://footshorts.com',
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
