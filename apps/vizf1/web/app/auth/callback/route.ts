import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServerAuth'

export const runtime = 'nodejs'

const ONBOARDING = '/onboarding/drivers'
const HOME = '/feed'

/**
 * OAuth / magic-link return path. Exchanges the `?code` for a session (cookies
 * set via `createServerSupabase`) and redirects to `?next` (default `/feed`).
 * Consumer signup is open, so there's no allow-list.
 *
 * The sign-in modal sets `?next` to wherever the visitor was headed; a
 * brand-new account still goes through onboarding first.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next') || HOME
  let next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : `/${nextParam.replace(/^\/+/, '')}`

  if (code) {
    const supabase = await createServerSupabase()
    const { data } = await supabase.auth.exchangeCodeForSession(code)
    const userId = data.session?.user.id
    if (userId && !next.startsWith('/onboarding')) {
      const { data: profile } = await supabase
        .from('vizf1_profiles')
        .select('onboarded_at')
        .eq('id', userId)
        .maybeSingle()
      if (!profile?.onboarded_at) next = ONBOARDING
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
