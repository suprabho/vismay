'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import { AuthGate } from '@/components/AuthGate'
import { useAuth } from '@/lib/AuthProvider'

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  )
}

function Gate({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const edit = params.get('edit')

  const blocked = loading || (!!session && !profile)

  useEffect(() => {
    if (blocked || !session) return
    // Already-onboarded users only reach onboarding via the edit flow; send
    // them home (this also covers the moment onboarding itself completes).
    if (profile?.onboarded_at && !edit) {
      router.replace('/feed')
    }
  }, [blocked, session, profile, edit, router])

  if (blocked) return <Spinner />
  // Logged out: ask to sign in right here instead of bouncing to /login.
  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <AuthGate message="Sign in to pick your drivers and teams">{children}</AuthGate>
      </div>
    )
  }
  return <>{children}</>
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Spinner />}>
      <Gate>{children}</Gate>
    </Suspense>
  )
}
