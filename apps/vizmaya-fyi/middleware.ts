import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'crypto'
import { ADMIN_COOKIE_NAME, expectedToken } from '@/lib/adminAuth'

export const runtime = 'nodejs'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/admin/login') return NextResponse.next()

  const expected = expectedToken()
  if (!expected) return NextResponse.next()

  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)
  if (cookie) {
    const a = Buffer.from(cookie.value)
    const b = Buffer.from(expected)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return NextResponse.next()
    }
  }

  const url = req.nextUrl.clone()
  url.pathname = '/admin/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/story/:slug/share',
    '/story/:slug/autoplay',
  ],
}
