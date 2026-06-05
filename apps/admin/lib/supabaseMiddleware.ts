import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareSupabase } from '@/lib/supabaseServer'

export interface SessionGuardOptions {
  /** Page path to redirect unauthenticated requests to. */
  loginPath: string
  /** Paths that bypass the session check entirely (e.g. `/`, `/login`). */
  bypassPaths?: string[]
  /**
   * Prefixes answered with `401 application/json` instead of a redirect — a
   * 307 redirect would make a non-GET API fetch replay into a page route.
   * Matches the legacy `createAdminMiddleware` contract. Default `['/api/']`.
   */
  apiPathPrefixes?: string[]
}

/**
 * Supabase-session equivalent of `@vismay/admin-core`'s `createAdminMiddleware`.
 * Verifies the per-user session via `getUser()` and, on success, returns a
 * response carrying any refreshed session cookies. Unauthenticated requests get
 * a 401 (API) or a redirect to `loginPath?next=…` (pages) — same shape as the
 * legacy HMAC middleware so the rest of the pipeline is unchanged.
 */
export async function supabaseSessionGuard(
  req: NextRequest,
  { loginPath, bypassPaths = [], apiPathPrefixes = ['/api/'] }: SessionGuardOptions,
): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  // The response must exist before the client so refreshed cookies land on it.
  const res = NextResponse.next({ request: req })
  if (bypassPaths.includes(pathname)) return res

  const supabase = createMiddlewareSupabase(req, res)
  const { data, error } = await supabase.auth.getUser()
  if (!error && data.user) return res

  const isApi = apiPathPrefixes.some((p) => pathname === p || pathname.startsWith(p))
  if (isApi) {
    return new NextResponse(
      JSON.stringify({ error: 'unauthorized', reason: 'invalid session' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )
  }

  const url = req.nextUrl.clone()
  url.pathname = loginPath
  url.search = ''
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}
