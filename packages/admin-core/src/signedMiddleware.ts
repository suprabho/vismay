import { NextResponse, type NextRequest } from 'next/server'
import { verifySignedRequest } from './signedUrl'

export interface SignedMiddlewareOptions {
  /** Env var holding the signing secret. Default 'ADMIN_SESSION_SECRET'. */
  secretEnv?: string
  /**
   * When the signing secret is unset, let requests through instead of 401ing.
   * Useful in local dev before the secret is configured. Default false — fail
   * closed so misconfigured prod can't accidentally expose gated routes.
   */
  passThroughWhenUnconfigured?: boolean
}

const BODY = 'Unauthorized: missing or invalid signed-URL token'

/**
 * Next.js middleware factory for gated consumer-domain output routes
 * (share cards, autoplay, canvas-frame previews, PDF renders).
 *
 * Verifies the HMAC token attached to the request URL by admin's
 * `signOutputUrl()` and 401s on miss. Stateless — no cookie, no session,
 * works across any top-level domain.
 *
 * Matcher is the caller's job: declare it in `config.matcher` of the
 * consumer app's middleware.ts.
 */
export function createSignedOutputMiddleware(
  options: SignedMiddlewareOptions = {}
) {
  const { secretEnv = 'ADMIN_SESSION_SECRET', passThroughWhenUnconfigured = false } = options

  return function middleware(req: NextRequest): NextResponse {
    if (!process.env[secretEnv]) {
      if (passThroughWhenUnconfigured) return NextResponse.next()
      return new NextResponse(`${BODY} (signing secret not configured)`, { status: 401 })
    }

    const ok = verifySignedRequest(
      { pathname: req.nextUrl.pathname, searchParams: req.nextUrl.searchParams },
      { secretEnv }
    )
    if (!ok) return new NextResponse(BODY, { status: 401 })
    return NextResponse.next()
  }
}
