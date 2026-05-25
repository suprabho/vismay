import { createSignedOutputMiddleware } from '@vismay/admin-core/signedMiddleware'

export const runtime = 'nodejs'

/**
 * Gated "output" routes are rendered on this domain but only ever requested
 * by admin (canvas iframe, share-card preview, autoplay capture, PDF render).
 * Admin signs the URL with HMAC(ADMIN_SESSION_SECRET, path|exp) via
 * `signOutputUrl()` and middleware verifies the token.
 *
 * Stateless — no cookie, no cross-domain hand-off. See docs/auth.md.
 *
 * In dev without ADMIN_SESSION_SECRET set, requests fall through so the local
 * loop isn't blocked. Prod fails closed.
 *
 * The story output routes below don't all exist on vizf1.com yet — they get
 * gated harmlessly when they don't match, and the day someone adds e.g.
 * `/story/[slug]/share` it's locked from the first commit.
 */
export const middleware = createSignedOutputMiddleware({
  passThroughWhenUnconfigured: process.env.NODE_ENV !== 'production',
})

export const config = {
  matcher: [
    '/story/:slug/share',
    '/story/:slug/autoplay',
    '/story/:slug/canvas-frame/:id',
    '/story/:slug/report',
    '/story/:slug/slides',
  ],
}
