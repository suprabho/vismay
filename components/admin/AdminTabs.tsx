'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin', label: 'Stories' },
  { href: '/admin/epics', label: 'Epics' },
  { href: '/admin/demos', label: 'Demos' },
]

export function AdminTabs() {
  const pathname = usePathname() ?? ''
  return (
    <nav className="flex gap-1 px-2 py-2 border-b border-white/5">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              active
                ? 'bg-white/10 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
