'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin', label: 'Stories' },
  { href: '/admin/epics', label: 'Epics' },
  { href: '/admin/demos', label: 'Demos' },
  { href: '/admin/social', label: 'Social' },
]

export function AdminTabs() {
  const pathname = usePathname() ?? ''
  return (
    <nav className="flex gap-1">
      {TABS.map((tab) => {
        const active =
          tab.href === '/admin'
            ? pathname === '/admin'
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
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
