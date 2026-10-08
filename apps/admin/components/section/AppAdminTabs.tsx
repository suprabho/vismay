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
    tabs.push({ href: `/${appSlug}/power-rankings`, label: 'Power rankings' })
    tabs.push({ href: `/${appSlug}/match-facts`, label: 'Match facts' })
    // Agent-authored pages hosted at footshorts.com/s/<slug> (packages/html-stories).
    tabs.push({ href: `/${appSlug}/html-stories`, label: 'HTML stories' })
    // The Football Desk randomizer: topics for those pages (packages/randomizer).
    tabs.push({ href: `/${appSlug}/randomizer`, label: 'Randomizer' })
    tabs.push({ href: `/${appSlug}/cup-fixtures`, label: 'Cup fixtures' })
    tabs.push({ href: `/${appSlug}/share-cards`, label: 'Share cards' })
    tabs.push({ href: `/${appSlug}/asset-studio`, label: 'Asset studio' })
  }
  // Agent-authored pages hosted at vizf1.com/s/<slug> (packages/html-stories),
  // briefed with a race context: sessions, drivers' telemetry and standings.
  if (appSlug === 'vizf1') {
    tabs.push({ href: `/${appSlug}/html-stories`, label: 'HTML stories' })
  }
  // VizNBA: the news worker's health (viznba_ tables), agent-authored pages
  // hosted at viznba's /s/<slug> briefed with ESPN box scores, and the NBA
  // Desk randomizer that picks their topics.
  if (appSlug === 'viznba') {
    tabs.push({ href: `/${appSlug}/pipeline`, label: 'Pipeline' })
    tabs.push({ href: `/${appSlug}/html-stories`, label: 'HTML stories' })
    tabs.push({ href: `/${appSlug}/randomizer`, label: 'Randomizer' })
  }
  // Recipe-corpora coverage (migration 070) + the history review queue
  // (migration 071) are the food vertical's — umami-only. Social frames is the
  // umami compose-frames creator (vizmaya layer composer in umami mode).
  if (appSlug === 'umami') {
    tabs.push({ href: `/${appSlug}/recipes`, label: 'Recipes' })
    tabs.push({ href: `/${appSlug}/history`, label: 'History' })
    tabs.push({ href: `/${appSlug}/share-cards`, label: 'Social frames' })
  }
  return <Tabs tabs={tabs} />
}
