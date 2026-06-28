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

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/feed" className="text-lg font-bold text-text">
          VizF1
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = item.match(pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? 'rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-text'
                    : 'rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-text'
                }
              >
                {item.label}
              </Link>
            )
          })}
          {!loading &&
            (session ? (
              <Link
                href="/following"
                aria-label="Following"
                className={
                  pathname.startsWith('/following') || pathname.startsWith('/onboarding')
                    ? 'ml-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-text'
                    : 'ml-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-text'
                }
              >
                Following
              </Link>
            ) : (
              <Link
                href="/login"
                className="ml-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text hover:border-muted"
              >
                Sign in
              </Link>
            ))}
        </nav>
      </div>
    </header>
  )
}
