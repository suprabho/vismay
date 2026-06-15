'use client'

import { AdminTabs as Tabs, type AdminTab } from '@vismay/admin-core'

interface Props {
  appSlug: string
  /** Show the HeyGen Studio tab — only when a HeyGen API key is configured. */
  heygenEnabled?: boolean
}

export function AppAdminTabs({ appSlug, heygenEnabled }: Props) {
  const tabs: AdminTab[] = [
    { href: `/${appSlug}`, label: 'Stories', exact: true },
    { href: `/${appSlug}/compose`, label: 'Compose' },
    { href: `/${appSlug}/epics`, label: 'Epics' },
  ]
  // Ingest pipeline stats + match-day recaps + the on-brand share-card creator
  // + the HeyGen video studio are footshorts-only.
  if (appSlug === 'footshorts') {
    tabs.push({ href: `/${appSlug}/pipeline`, label: 'Pipeline' })
    tabs.push({ href: `/${appSlug}/recaps`, label: 'Recaps' })
    tabs.push({ href: `/${appSlug}/share-cards`, label: 'Share cards' })
    if (heygenEnabled) {
      tabs.push({ href: `/${appSlug}/heygen-studio`, label: 'HeyGen Studio' })
    }
  }
  return <Tabs tabs={tabs} />
}
