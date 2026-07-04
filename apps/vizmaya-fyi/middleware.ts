import { createSignedOutputMiddleware } from '@vismay/admin-core/signedMiddleware'

export const runtime = 'nodejs'

/**
 * Gated "output" routes are rendered on this domain but only ever requested
 * by admin (canvas iframe, share-card preview, autoplay capture, PDF render,
 * reports builder).
 *
 * Admin signs the URL with HMAC(ADMIN_SESSION_SECRET, path|exp) via
 * `signOutputUrl()` and middleware verifies the token. Stateless — no
 * cookie, no cross-domain hand-off. The reports builder lives at
 * `/reports` and `/reports/:slug`; admin mints signed URLs via
 * `signReportsBuilderUrl()` / `signReportsIndexUrl()` in
 * `apps/admin/lib/signedConsumerLinks.ts`.
 *
 * See docs/auth.md for the full three-scope model. In dev without
 * ADMIN_SESSION_SECRET set, requests fall through so the local loop isn't
 * blocked. Prod fails closed.
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
    '/story/:slug/newsletter',
    '/reports',
    '/reports/:slug',
    '/newsletters/:slug',
  ],
}
