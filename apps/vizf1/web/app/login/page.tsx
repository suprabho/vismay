'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo } from 'react'
import { AuthWidget, createSupabaseAuthClient } from '@vismay/ui'
import { ChequeredFlagMark } from '@vizf1/brand/logos'
import { useAuth } from '@/lib/AuthProvider'
import { AUTH_BRAND_STYLE } from '@/lib/AuthModalProvider'
import { supabaseAuth } from '@/lib/supabaseAuth'

function LoginInner() {
  const { session, profile, loading } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  // Same-origin paths only, so `?next=` can't bounce users off-site.
  const nextParam = params.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null

  // Once signed in (and the profile has landed), new accounts go through
  // onboarding; returning users go where they were headed.
  useEffect(() => {
    if (loading || !session || !profile) return
    router.replace(profile.onboarded_at ? (next ?? '/feed') : '/onboarding/drivers')
  }, [loading, session, profile, next, router])

  const authClient = useMemo(() => createSupabaseAuthClient(supabaseAuth()), [])
  const oauthRedirect =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
      : undefined

  return (
    <main className="flex min-h-screen flex-col justify-center bg-bg px-6">
      <div className="mx-auto w-full max-w-sm">
        <AuthWidget
          authClient={authClient}
          providers={['password', 'google']}
          allowSignup
          redirectTo={oauthRedirect}
          brand={{ name: 'VizF1', logo: <ChequeredFlagMark className="h-6 w-auto text-accent" /> }}
          copy={{ signupSubtitle: 'Create an account to follow drivers and teams.' }}
          style={AUTH_BRAND_STYLE}
        />
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}
