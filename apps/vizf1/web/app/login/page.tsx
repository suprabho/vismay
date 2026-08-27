'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, type CSSProperties } from 'react'
import { AuthWidget, createSupabaseAuthClient } from '@vismay/ui'
import { ChequeredFlagMark } from '@vizf1/brand/logos'
import { useAuth } from '@/lib/AuthProvider'
import { supabaseAuth } from '@/lib/supabaseAuth'

// Map vizf1's brand tokens (hex `--color-*`) onto the shared widget's `--auth-*`
// variables, so the widget renders in VizF1's brand.
const BRAND_STYLE = {
  '--auth-bg': 'transparent',
  '--auth-surface': 'var(--color-surface)',
  '--auth-fg': 'var(--color-text)',
  '--auth-muted': 'var(--color-muted)',
  '--auth-border': 'var(--color-border)',
  '--auth-accent': 'var(--color-accent)',
  '--auth-accent-fg': 'var(--color-accent-text)',
} as CSSProperties

export default function LoginPage() {
  const { session, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && session) router.replace('/onboarding/drivers')
  }, [loading, session, router])

  const authClient = useMemo(() => createSupabaseAuthClient(supabaseAuth()), [])

  return (
    <main className="flex min-h-screen flex-col justify-center bg-bg px-6">
      <div className="mx-auto w-full max-w-sm">
        <AuthWidget
          authClient={authClient}
          providers={['password', 'google']}
          allowSignup
          brand={{ name: 'VizF1', logo: <ChequeredFlagMark className="h-6 w-auto text-accent" /> }}
          copy={{ signupSubtitle: 'Create an account to follow drivers and teams.' }}
          onAuthed={() => router.replace('/onboarding/drivers')}
          style={BRAND_STYLE}
        />
      </div>
    </main>
  )
}
