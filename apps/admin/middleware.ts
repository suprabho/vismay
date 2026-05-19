import { createAdminMiddleware } from '@vismay/admin-core/middleware'
import { auth } from '@/lib/adminAuth'

export const runtime = 'nodejs'

export const middleware = createAdminMiddleware({
  auth,
  loginPath: '/login',
  bypassPaths: ['/login'],
})

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
