'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserCircle } from '@phosphor-icons/react'
import { Logo } from './Logo'

const SECTIONS = [
  { href: '/', label: 'Feed', match: (p: string) => p === '/' },
  { href: '/for-you', label: 'For you', match: (p: string) => p.startsWith('/for-you') },
  { href: '/calendar', label: 'Calendar', match: (p: string) => p.startsWith('/calendar') },
  { href: '/editorial', label: 'Editorial', match: (p: string) => p.startsWith('/editorial') },
]

export function AppHeader() {
  const path = usePathname()
  return (
    <header className="sticky top-0 z-30 flex h-14 flex-none items-center justify-between gap-1.5 border-b border-border bg-bg/95 px-3 backdrop-blur">
      <Link href="/" aria-label="VizNBA home" className="flex size-9 items-center justify-center">
        <Logo size={30} />
      </Link>
      <nav
        aria-label="Sections"
        className="flex gap-0.5 rounded-full border border-border bg-surface p-[3px]"
      >
        {SECTIONS.map((s) => {
          const active = s.match(path)
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full px-2.5 py-[9px] text-[12.5px] leading-none ${
                active ? 'bg-accent font-semibold text-accent-ink' : 'font-medium text-muted hover:text-text'
              }`}
            >
              {s.label}
            </Link>
          )
        })}
      </nav>
      <Link
        href="/teams"
        aria-label="Your teams"
        className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-text"
      >
        <UserCircle size={20} />
      </Link>
    </header>
  )
}
