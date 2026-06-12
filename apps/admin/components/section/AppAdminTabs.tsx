'use client'

import { AdminTabs as Tabs, type AdminTab } from '@vismay/admin-core'

interface Props {
  appSlug: string
}

export function AppAdminTabs({ appSlug }: Props) {
  const tabs: AdminTab[] = [
    { href: `/${appSlug}`, label: 'Stories', exact: true },
    { href: `/${appSlug}/compose`, label: 'Compose' },
    { href: `/${appSlug}/epics`, label: 'Epics' },
  ]
  return <Tabs tabs={tabs} />
}
