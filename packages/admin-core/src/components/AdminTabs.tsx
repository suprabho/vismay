'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface AdminTab {
  href: string
  label: string
  /** If true, the tab is active only when pathname === href. Otherwise, active when pathname === href OR starts with `${href}/`. */
  exact?: boolean
}

interface Props {
  tabs: AdminTab[]
  className?: string
}

export function AdminTabs({ tabs, className = 'flex gap-1' }: Props) {
  const pathname = usePathname() ?? ''
  return (
    <nav className={className}>
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
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

export default AdminTabs
