import type { Metadata } from 'next'
import { getEpic, getEpicStories, getIeaCountries, getIeaNewsSince } from '@/lib/epics'
import IeaLanding from './IeaLanding'
import { resolveIeaTheme } from './theme'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'IEA — vizmaya',
  description:
    'Live energy news, country profiles, and vizmaya stories on the global energy transition.',
  alternates: { canonical: '/iea' },
}

export default async function IeaPage() {
  const [epic, countries, news, stories] = await Promise.all([
    getEpic('iea'),
    getIeaCountries(),
    getIeaNewsSince(7),
    getEpicStories('iea'),
  ])

  if (!epic) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400">
        IEA epic not seeded. Apply migration 015.
      </div>
    )
  }

  const theme = resolveIeaTheme(epic.theme)

  return (
    <IeaLanding
      epic={epic}
      countries={countries}
      news={news}
      stories={stories}
      theme={theme}
    />
  )
}
