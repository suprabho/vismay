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
    <nav className="flex gap-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 px-2.5 py-1 rounded-md text-sm transition-colors ${
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
