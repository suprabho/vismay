'use client'

import { AdminTabs as Tabs, type AdminTab } from '@vismay/admin-core'

const TABS: AdminTab[] = [
  { href: '/vizmaya', label: 'Stories', exact: true },
  { href: '/vizmaya/epics', label: 'Epics' },
  { href: '/vizmaya/apps', label: 'Apps' },
  { href: '/vizmaya/demos', label: 'Demos' },
  { href: '/vizmaya/social', label: 'Social' },
]

export function AdminTabs() {
  return <Tabs tabs={TABS} />
}
