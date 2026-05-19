import { createAdminMiddleware } from '@vismay/admin-core/middleware'
import { auth } from '@/lib/adminAuth'

export const runtime = 'nodejs'

/**
 * After the admin lift, only signed share/autoplay routes need a gate here.
 * Unauthed visitors are bounced to the central admin login (configured via
 * ADMIN_LOGIN_URL — set to admin.vizmaya.fyi/login in prod, localhost:3001/login
 * in local dev).
 */
const ADMIN_LOGIN_URL = process.env.ADMIN_LOGIN_URL || 'http://localhost:3001/login'

export const middleware = createAdminMiddleware({
  auth,
  loginPath: ADMIN_LOGIN_URL,
})

export const config = {
  matcher: [
    '/story/:slug/share',
    '/story/:slug/autoplay',
  ],
}
