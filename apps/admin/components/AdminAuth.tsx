'use client'

import { useMemo, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  AuthWidget,
  createAuthBrowserClient,
  createAdminAuthClient,
} from '@vismay/ui'
import { adminCookieDomainForHost } from '@/lib/adminCookieDomain'

interface Props {
  next: string
  brandName: string
  accent: string
  accentFg?: string
}

/**
 * Admin sign-in surface. Renders the shared {@link AuthWidget} with the admin
 * adapter: password posts to `/api/login` (server-side allow-list + host-only
 * cookie), Google / magic-link go through the browser client and return to
 * `/auth/callback` (which re-checks the allow-list). Sign-up is disabled —
 * admin accounts are provisioned with the createAdminUser script.
 *
 * Branding is the vertical accent (derived from the host in the page) mapped
 * onto the widget's `--auth-*` variables over its dark defaults.
 */
export default function AdminAuth({ next, brandName, accent, accentFg }: Props) {
  const router = useRouter()

  const authClient = useMemo(() => {
    // Scope the session cookie to the SAME domain the server client uses
    // (`.vismay.xyz` for the admin family, host-only elsewhere). Without this
    // the browser client can't clear an invalid session cookie the server set,
    // and a dead refresh token loops against /token until it's rate-limited.
    const domain =
      typeof window !== 'undefined'
        ? adminCookieDomainForHost(window.location.hostname)
        : undefined
    const supabase = createAuthBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      domain ? { cookieOptions: { domain } } : undefined,
    )
    return createAdminAuthClient({ supabase })
  }, [])

  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : undefined

  const style = {
    '--auth-accent': accent,
    '--auth-accent-fg': accentFg ?? '#0a0a0a',
  } as CSSProperties

  return (
    <AuthWidget
      authClient={authClient}
      providers={['password', 'google']}
      allowSignup={false}
      brand={{ name: brandName }}
      redirectTo={redirectTo}
      onAuthed={() => {
        router.replace(next)
        router.refresh()
      }}
      style={style}
    />
  )
}
