'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/AuthProvider'

type NavItem = { href: string; label: string; match: (p: string) => boolean }

const NAV: NavItem[] = [
  { href: '/feed', label: 'For You', match: (p) => p === '/feed' || p.startsWith('/driver') || p.startsWith('/team') },
  { href: '/schedule', label: 'Schedule', match: (p) => p.startsWith('/schedule') || p.startsWith('/race') },
  { href: '/discover', label: 'Discover', match: (p) => p.startsWith('/discover') },
  { href: '/editorial', label: 'Editorial', match: (p) => p.startsWith('/editorial') },
]

export function AppHeader() {
  const pathname = usePathname() ?? ''
  const { session, loading } = useAuth()

  const letter = (session?.user?.email ?? '?').charAt(0).toUpperCase()
  const followingActive = pathname.startsWith('/following') || pathname.startsWith('/onboarding')

  return (
    <header className="sticky top-0 z-10 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-1.5 px-3 py-1 sm:gap-2 sm:px-4">
        <Link href="/feed" className="shrink-0 text-base font-bold text-text sm:text-lg">
          VizF1
        </Link>
        <nav
          className="mx-auto my-2 flex min-w-0 overflow-x-auto rounded-full border border-border bg-surface/60 p-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {NAV.map((item) => {
            const active = item.match(pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full px-2 py-1.5 text-[11px] font-medium transition-colors sm:px-4 sm:text-sm ${
                  active ? 'bg-accent font-semibold text-accent-text' : 'text-muted hover:text-text'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        {loading ? (
          <span className="h-9 w-9 shrink-0" aria-hidden />
        ) : session ? (
          <Link
            href="/following"
            aria-label="Following"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
              followingActive
                ? 'border-accent bg-accent text-accent-text'
                : 'border-border bg-surface text-text hover:border-muted'
            }`}
          >
            {letter}
          </Link>
        ) : (
          <Link
            href="/login"
            className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text hover:border-muted sm:px-3 sm:text-sm"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
