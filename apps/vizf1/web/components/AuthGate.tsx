'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { LockSimple } from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthProvider'
import { useAuthModal } from '@/lib/AuthModalProvider'

/**
 * Wraps account-only routes. Logged-out visitors get the sign-in modal over a
 * "sign in to continue" prompt — never a bounce to /login or a broken page —
 * and land back on this route once they're in.
 */
export function AuthGate({
  children,
  message = 'Sign in to continue',
}: {
  children: React.ReactNode
  message?: string
}) {
  const { session, loading } = useAuth()
  const { requireAuth } = useAuthModal()
  const pathname = usePathname() ?? '/'
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const dest = `${pathname}${search}`

  useEffect(() => {
    if (!loading && !session) requireAuth(dest)
  }, [loading, session, dest, requireAuth])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <LockSimple size={22} weight="bold" />
        </span>
        <p className="text-lg font-semibold text-text">{message}</p>
        <p className="max-w-xs text-sm text-muted">
          Standings, races and stories are free to browse. An account keeps your drivers and teams.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => requireAuth(dest)}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-text hover:opacity-90"
          >
            Sign in
          </button>
          <Link
            href="/feed"
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-text hover:border-muted"
          >
            Browse the feed
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
