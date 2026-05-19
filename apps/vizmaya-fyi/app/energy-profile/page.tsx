import type { Metadata } from 'next'
import {
  getDominantEnergySourceByCountry,
  getEpic,
  getEpicStories,
  getIeaCountries,
  getIeaNewsSince,
} from '@vismay/content-source/epics'
import EnergyProfileLanding from './EnergyProfileLanding'
import { resolveEnergyProfileMapStyle, resolveEnergyProfileTheme } from './theme'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'Energy Profile — vizmaya',
  description:
    'Live energy news, country profiles, and vizmaya stories on the global energy transition.',
  alternates: { canonical: '/energy-profile' },
}

export default async function EnergyProfilePage() {
  const [epic, countries, news, stories, dominantSources] = await Promise.all([
    getEpic('energy-profile'),
    getIeaCountries(),
    getIeaNewsSince(7),
    getEpicStories('energy-profile'),
    getDominantEnergySourceByCountry(),
  ])

  if (!epic) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400">
        Energy Profile epic not seeded. Apply migration 019.
      </div>
    )
  }

  const theme = resolveEnergyProfileTheme(epic.theme)
  const mapStyle = resolveEnergyProfileMapStyle(epic.theme)

  return (
    <EnergyProfileLanding
      epic={epic}
      countries={countries}
      news={news}
      stories={stories}
      theme={theme}
      mapStyle={mapStyle}
      dominantSources={dominantSources}
    />
  )
}
