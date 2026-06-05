import { NextResponse, type NextRequest } from 'next/server'
import { createAdminMiddleware } from '@vismay/admin-core/middleware'
import { auth } from '@/lib/adminAuth'
import { isSupabaseConfigured } from '@/lib/supabaseServer'
import { supabaseSessionGuard } from '@/lib/supabaseMiddleware'
import {
  vizmayaPublicUrl,
  vizf1PublicUrl,
  footshortsPublicUrl,
  originVariants,
} from '@/lib/publicSite'
import { ACTION_TOKEN_HEADER } from '@vismay/admin-core/actionToken'

export const runtime = 'nodejs'

/**
 * Origins admin trusts for cross-TLD action-token API calls. Editors on the
 * consumer TLDs (autoplay, share, …) fetch admin's API directly with an
 * action token in the `x-action-token` header (see docs/auth.md Phase 2a);
 * the browser requires CORS headers on both the preflight and the actual
 * response for the call to succeed.
 *
 * Both apex and `www.` variants are included for each TLD — Vercel's default
 * www redirect changes which one ends up in the browser's Origin header, and
 * preflight requests can't follow redirects, so a mismatch fails as
 * "Redirect is not allowed for a preflight request" instead of a useful 401.
 *
 * Only `/api/*` paths get CORS treatment — page routes stay closed.
 */
const ALLOWED_CONSUMER_ORIGINS = new Set<string>([
  ...originVariants(vizmayaPublicUrl),
  ...originVariants(vizf1PublicUrl),
  ...originVariants(footshortsPublicUrl),
])

function corsHeadersFor(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': `content-type, ${ACTION_TOKEN_HEADER}`,
    'access-control-max-age': '86400',
    // Each consumer origin gets its own response, so caches must key on Origin.
    vary: 'Origin',
  }
}

const SESSION_OPTIONS = { loginPath: '/login', bypassPaths: ['/', '/login'] }

// Legacy shared-password gate, used only when Supabase isn't configured.
const adminMiddleware = createAdminMiddleware({ auth, ...SESSION_OPTIONS })

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get('origin')
  const allowedOrigin =
    origin && ALLOWED_CONSUMER_ORIGINS.has(origin) ? origin : null
  const isApi = req.nextUrl.pathname.startsWith('/api/')
  const hasActionToken = req.headers.get(ACTION_TOKEN_HEADER) !== null

  // Preflight: short-circuit before the cookie check would 401. Only for
  // /api/* requests from an allowed consumer TLD — anything else falls
  // through to the regular admin middleware so a stray OPTIONS to a page
  // route still goes through the normal pipeline.
  if (req.method === 'OPTIONS' && allowedOrigin && isApi) {
    return new NextResponse(null, { status: 204, headers: corsHeadersFor(allowedOrigin) })
  }

  // Cross-TLD editor save: when an /api/* request arrives from an allowed
  // consumer origin AND carries an action token, bypass the cookie gate
  // and let the route handler verify the token itself. The wrapper still
  // bounds this two ways — origin must be in our allowlist (browser-enforced
  // via CORS), and the header must be present — so the trust check is just
  // moved one layer down to where the scope/subject context exists.
  if (allowedOrigin && isApi && hasActionToken) {
    const res = NextResponse.next()
    const headers = corsHeadersFor(allowedOrigin)
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
    return res
  }

  const res = isSupabaseConfigured()
    ? await supabaseSessionGuard(req, SESSION_OPTIONS)
    : adminMiddleware(req)

  // Attach CORS headers to the regular response so the browser lets the
  // editor read the body (including any 401 the middleware emitted — without
  // these headers a 401 surfaces as "TypeError: Failed to fetch" client-side
  // instead of a useful status).
  if (allowedOrigin && isApi) {
    const headers = corsHeadersFor(allowedOrigin)
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
  }
  return res
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - /api/login, /api/logout (handled by their routes)
     * - /_next (Next internals + static)
     * - /favicon.ico, /robots.txt, /sitemap.xml
     */
    '/((?!api/login|api/logout|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}
