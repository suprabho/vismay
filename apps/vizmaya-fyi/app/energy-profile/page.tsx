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
import EpicSeoBlock from '@/components/epic/EpicSeoBlock'
import JsonLd from '@/components/JsonLd'
import { buildEpicJsonLd, buildBreadcrumbJsonLd } from '@/lib/jsonLd'

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

  const epicJsonLd = buildEpicJsonLd({
    slug: epic.slug,
    name: epic.name,
    description: epic.description,
    stories,
    explainer: epic.explainer,
    datePublished: epic.datePublished,
    dateModified: epic.dateModified,
  })
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: epic.name, url: `/${epic.slug}` },
  ])

  return (
    <>
      <JsonLd data={[...(Array.isArray(epicJsonLd) ? epicJsonLd : [epicJsonLd]), breadcrumbJsonLd]} />
      <EnergyProfileLanding
        epic={epic}
        countries={countries}
        news={news}
        stories={stories}
        theme={theme}
        mapStyle={mapStyle}
        dominantSources={dominantSources}
      />
      <EpicSeoBlock
        name={epic.name}
        explainer={epic.explainer}
        takeaways={epic.takeaways}
        stories={stories}
      />
    </>
  )
}
