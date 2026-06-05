import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { isAllowedEmail } from '@/lib/adminAuth'

export const runtime = 'nodejs'

/**
 * OAuth / magic-link return path. The browser client started the flow with
 * `redirectTo=…/auth/callback?next=…`; here we exchange the `?code` for a
 * session (cookies set via `createServerSupabase`, host-only per vertical) and
 * then enforce the admin allow-list — a valid Supabase session is NOT enough on
 * this shared-with-footshorts project (mirrors the password path in
 * `adminAuth.signIn`). Non-admins are signed out and bounced to `/login`.
 *
 * This route is in `bypassPaths` (see middleware.ts) so the session guard
 * doesn't redirect it before it can establish the session.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next') || '/'
  const next = nextParam.startsWith('/') ? nextParam : `/${nextParam}`

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing-code', url.origin))
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth', url.origin))
  }

  const { data } = await supabase.auth.getUser()
  if (!isAllowedEmail(data.user?.email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=not-admin', url.origin))
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
