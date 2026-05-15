import type { Metadata } from 'next'
import { getEpic, getEpicStories } from '@/lib/epics'
import { getFifaWc26Teams } from '@/lib/fifa-wc26'
import FifaWc26Landing from './FifaWc26Landing'
import { resolveFifaWc26Theme } from './theme'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'FIFA World Cup 2026 — vizmaya',
  description:
    'The 48 nations at the 2026 World Cup — by squad value, economy, and democracy.',
  alternates: { canonical: '/fifa-wc26' },
}

export default async function FifaWc26Page() {
  const [epic, teams, stories] = await Promise.all([
    getEpic('fifa-wc26'),
    getFifaWc26Teams(),
    getEpicStories('fifa-wc26'),
  ])

  if (!epic) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400">
        FIFA World Cup 2026 epic not seeded. Apply migration 025.
      </div>
    )
  }

  const theme = resolveFifaWc26Theme(epic.theme)

  return (
    <FifaWc26Landing epic={epic} teams={teams} stories={stories} theme={theme} />
  )
}
