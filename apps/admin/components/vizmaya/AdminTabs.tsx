'use client'

import { AdminTabs as Tabs, type AdminTab } from '@vismay/admin-core'

const TABS: AdminTab[] = [
  { href: '/vizmaya', label: 'Stories', exact: true },
  { href: '/vizmaya/compose', label: 'Compose' },
  { href: '/vizmaya/epics', label: 'Epics' },
  { href: '/vizmaya/pipeline', label: 'Pipeline' },
  { href: '/vizmaya/recaps', label: 'Recaps' },
  { href: '/vizmaya/authors', label: 'Authors' },
  { href: '/vizmaya/apps', label: 'Apps' },
  { href: '/vizmaya/demos', label: 'Demos' },
  { href: '/vizmaya/social', label: 'Social' },
  { href: '/vizmaya/share-cards', label: 'Share cards' },
  { href: '/vizmaya/video', label: 'Video' },
]

export function AdminTabs() {
  return <Tabs tabs={TABS} />
}
