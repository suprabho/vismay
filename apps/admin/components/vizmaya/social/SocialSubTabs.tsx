'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SUB_TABS = [
  { href: '/vizmaya/social', label: 'Plan' },
  { href: '/vizmaya/social/monitor', label: 'Monitor' },
]

export function SocialSubTabs() {
  const pathname = usePathname() ?? ''
  return (
    <nav className="flex items-center gap-2">
      {SUB_TABS.map((t) => {
        const active =
          t.href === '/vizmaya/social' ? pathname === '/vizmaya/social' : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              active
                ? 'bg-white/10 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
