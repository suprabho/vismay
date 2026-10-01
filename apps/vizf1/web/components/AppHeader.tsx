'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Info } from '@phosphor-icons/react'
import { VF1MonogramFlat } from '@vizf1/brand/logos'
import { useAuth } from '@/lib/AuthProvider'
import { useAuthModal } from '@/lib/AuthModalProvider'

type NavItem = { href: string; label: string; match: (p: string) => boolean }

// Same three tabs as the Footshorts feed header; the schedule/calendar lives
// on the For You feed now, so /schedule and /race highlight For You.
const NAV: NavItem[] = [
  {
    href: '/feed',
    label: 'For you',
    match: (p) =>
      p === '/feed' ||
      p.startsWith('/driver') ||
      p.startsWith('/team') ||
      p.startsWith('/schedule') ||
      p.startsWith('/race'),
  },
  { href: '/discover', label: 'Discover', match: (p) => p.startsWith('/discover') },
  { href: '/editorial', label: 'Editorial', match: (p) => p.startsWith('/editorial') },
]

// One-to-one port of the Footshorts feed header: brand mark absolute-left,
// pill tab group centered, avatar/sign-in absolute-right.
export function AppHeader() {
  const pathname = usePathname() ?? ''
  const { session, loading } = useAuth()
  const { requireAuth } = useAuthModal()

  const letter = (session?.user?.email ?? '?').charAt(0).toUpperCase()

  return (
    <header className="sticky top-0 z-10 bg-bg/80 backdrop-blur">
      <div className="relative mx-auto flex max-w-2xl items-center justify-center px-4 py-1">
        <Link
          href="/feed"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text"
          aria-label="VizF1"
        >
          <VF1MonogramFlat className="h-5 w-auto sm:h-6" />
        </Link>
        <nav className="mx-auto my-2 inline-flex rounded-full border border-border bg-surface/60 p-1">
          {NAV.map((item) => {
            const active = item.match(pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                  active ? 'bg-accent font-semibold text-accent-text' : 'text-muted hover:text-text'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
          <Link
            href="/about-us"
            aria-label="About VizF1"
            title="About VizF1"
            className="hidden h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:text-text sm:flex"
          >
            <Info size={20} />
          </Link>
          {!loading &&
            (session ? (
              <Link
                href="/following"
                aria-label="Following"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold text-text hover:border-muted"
              >
                {letter}
              </Link>
            ) : (
              // Signing in happens in place (modal), then lands on Following.
              <button
                type="button"
                onClick={() => requireAuth('/following')}
                className="whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text hover:border-muted sm:px-3 sm:text-sm"
              >
                Sign in
              </button>
            ))}
        </div>
      </div>
    </header>
  )
}
