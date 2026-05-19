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
}

export function createAdminMiddleware(options: MiddlewareOptions) {
  const {
    auth,
    loginPath,
    bypassPaths = [],
    passThroughWhenUnconfigured = true,
  } = options
  const bypass = new Set<string>(bypassPaths)

  return function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl
    if (bypass.has(pathname)) return NextResponse.next()

    const expected = auth.expectedToken()
    if (!expected) {
      return passThroughWhenUnconfigured ? NextResponse.next() : redirectToLogin(req, loginPath, pathname)
    }

    const cookie = req.cookies.get(auth.cookieName)
    if (cookie) {
      const a = Buffer.from(cookie.value)
      const b = Buffer.from(expected)
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return NextResponse.next()
      }
    }

    return redirectToLogin(req, loginPath, pathname)
  }
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
