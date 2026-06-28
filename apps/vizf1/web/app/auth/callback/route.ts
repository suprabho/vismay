import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServerAuth'

export const runtime = 'nodejs'

/**
 * OAuth / magic-link return path. Exchanges the `?code` for a session (cookies
 * set via `createServerSupabase`) and redirects to `?next` (default
 * `/onboarding/drivers`). Consumer signup is open, so there's no allow-list.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next') || '/onboarding/drivers'
  const next = nextParam.startsWith('/') ? nextParam : `/${nextParam}`

  if (code) {
    const supabase = await createServerSupabase()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
