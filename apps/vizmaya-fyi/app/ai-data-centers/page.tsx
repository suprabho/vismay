import type { Metadata } from 'next'
import {
  getEpic,
  getEpicStories,
  listDataCenters,
} from '@vismay/content-source/epics'
import AiDataCentersLanding from './AiDataCentersLanding'
import { resolveAiDataCentersMapStyle, resolveAiDataCentersTheme } from './theme'
import EpicSeoBlock from '@/components/epic/EpicSeoBlock'
import JsonLd from '@/components/JsonLd'
import { buildEpicJsonLd, buildBreadcrumbJsonLd } from '@/lib/jsonLd'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'AI Data Centers — vizmaya',
  description:
    'Tracking the build-out of frontier AI data centers — power, compute, and capital, from satellite imagery and permits.',
  alternates: { canonical: '/ai-data-centers' },
}

// The migration seeds the epic row as draft, and getEpic only returns
// published epics — fall back to a static descriptor so the page works
// during rollout (and before migration 063 is applied at all).
const EPIC_FALLBACK = {
  slug: 'ai-data-centers',
  name: 'AI Data Centers',
  description:
    'Tracking the build-out of frontier AI data centers — power, compute, and capital, from satellite imagery and permits.',
  theme: {} as Record<string, unknown>,
}

export default async function AiDataCentersPage() {
  const [epic, facilities, stories] = await Promise.all([
    getEpic('ai-data-centers').catch(() => null),
    // Renders an empty map ("0 facilities tracked") when migration 063 isn't
    // applied yet or the importer hasn't run, instead of 500-ing.
    listDataCenters().catch((err) => {
      console.warn(`ai-data-centers: listDataCenters failed: ${err}`)
      return []
    }),
    getEpicStories('ai-data-centers').catch(() => []),
  ])

  const theme = resolveAiDataCentersTheme(epic?.theme ?? EPIC_FALLBACK.theme)
  const mapStyle = resolveAiDataCentersMapStyle(epic?.theme ?? EPIC_FALLBACK.theme)

  const epicJsonLd = epic
    ? buildEpicJsonLd({
        slug: epic.slug,
        name: epic.name,
        description: epic.description,
        stories,
        explainer: epic.explainer,
        datePublished: epic.datePublished,
        dateModified: epic.dateModified,
      })
    : null
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: (epic ?? EPIC_FALLBACK).name, url: '/ai-data-centers' },
  ])

  return (
    <>
      <JsonLd
        data={
          epicJsonLd
            ? [...(Array.isArray(epicJsonLd) ? epicJsonLd : [epicJsonLd]), breadcrumbJsonLd]
            : [breadcrumbJsonLd]
        }
      />
      <AiDataCentersLanding
        epic={epic ?? EPIC_FALLBACK}
        facilities={facilities}
        stories={stories}
        theme={theme}
        mapStyle={mapStyle}
      />
      {epic && (
        <EpicSeoBlock
          name={epic.name}
          explainer={epic.explainer}
          takeaways={epic.takeaways}
          stories={stories}
        />
      )}
    </>
  )
}
