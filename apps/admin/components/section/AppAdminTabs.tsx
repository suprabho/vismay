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
  // Ingest pipeline stats + match-day recaps + the on-brand share-card creator
  // are footshorts-only.
  if (appSlug === 'footshorts') {
    tabs.push({ href: `/${appSlug}/pipeline`, label: 'Pipeline' })
    tabs.push({ href: `/${appSlug}/recaps`, label: 'Recaps' })
    tabs.push({ href: `/${appSlug}/share-cards`, label: 'Share cards' })
    tabs.push({ href: `/${appSlug}/asset-studio`, label: 'Asset studio' })
  }
  return <Tabs tabs={tabs} />
}
