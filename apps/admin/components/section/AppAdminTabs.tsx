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
  // Match-day recaps + the on-brand share-card creator are footshorts-only.
  if (appSlug === 'footshorts') {
    tabs.push({ href: `/${appSlug}/recaps`, label: 'Recaps' })
    tabs.push({ href: `/${appSlug}/share-cards`, label: 'Share cards' })
  }
  return <Tabs tabs={tabs} />
}
