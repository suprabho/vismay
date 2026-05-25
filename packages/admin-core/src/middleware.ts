import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'crypto'
import type { Auth } from './auth'

export type LoginRedirect = string | ((req: NextRequest) => string | URL)

export interface MiddlewareOptions {
  auth: Auth
  /** Where to send unauthenticated requests. Pass a string path or a function that builds a URL (e.g. cross-origin). */
  loginPath: LoginRedirect
  /** Paths that bypass the auth check entirely (e.g. the login route itself). */
  bypassPaths?: string[]
  /** When `expectedToken()` returns null (no ADMIN_PASSWORD configured), pass requests through instead of redirecting. Default true. */
  passThroughWhenUnconfigured?: boolean
  /**
   * Path prefixes that should respond with `401 application/json` on auth failure
   * instead of a 307 redirect to `loginPath`. Default `['/api/']`.
   *
   * Why: `NextResponse.redirect` returns a 307 that preserves the method, so a
   * non-GET fetch (e.g. `PUT /api/vizmaya/stories/<slug>`) would follow the
   * redirect with the same method into a page route, which returns 404. Mutating
   * API callers expect machine-readable failures, not a UI redirect chain.
   */
  apiPathPrefixes?: string[]
}

export function createAdminMiddleware(options: MiddlewareOptions) {
  const {
    auth,
    loginPath,
    bypassPaths = [],
    passThroughWhenUnconfigured = true,
    apiPathPrefixes = ['/api/'],
  } = options
  const bypass = new Set<string>(bypassPaths)

  return function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl
    if (bypass.has(pathname)) return NextResponse.next()

    const expected = auth.expectedToken()
    if (!expected) {
      if (passThroughWhenUnconfigured) return NextResponse.next()
      return unauthorizedResponse(req, loginPath, pathname, apiPathPrefixes, 'not configured')
    }

    const cookie = req.cookies.get(auth.cookieName)
    if (cookie) {
      const a = Buffer.from(cookie.value)
      const b = Buffer.from(expected)
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return NextResponse.next()
      }
    }

    return unauthorizedResponse(req, loginPath, pathname, apiPathPrefixes, 'invalid session')
  }
}

function isApiPath(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p))
}

function unauthorizedResponse(
  req: NextRequest,
  loginPath: LoginRedirect,
  pathname: string,
  apiPathPrefixes: string[],
  reason: string
) {
  if (isApiPath(pathname, apiPathPrefixes)) {
    return new NextResponse(
      JSON.stringify({ error: 'unauthorized', reason }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    )
  }
  return redirectToLogin(req, loginPath, pathname)
}

function redirectToLogin(req: NextRequest, loginPath: LoginRedirect, next: string) {
  const target = typeof loginPath === 'function' ? loginPath(req) : loginPath

  if (typeof target === 'string' && target.startsWith('/')) {
    const url = req.nextUrl.clone()
    url.pathname = target
    url.search = ''
    url.searchParams.set('next', next)
    return NextResponse.redirect(url)
  }

  const absolute = new URL(typeof target === 'string' ? target : target.toString())
  absolute.searchParams.set('next', next)
  return NextResponse.redirect(absolute)
}
