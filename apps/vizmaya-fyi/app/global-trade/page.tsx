import type { Metadata } from 'next'
import { getEpic, getEpicStories } from '@vismay/content-source/epics'
import { getTradeLandscape } from '@vismay/content-source/trade'
import GlobalTradeLanding from './GlobalTradeLanding'
import { resolveGlobalTradeMapStyle, resolveGlobalTradeTheme } from './theme'
import EpicSeoBlock from '@/components/epic/EpicSeoBlock'
import JsonLd from '@/components/JsonLd'
import { buildEpicJsonLd, buildBreadcrumbJsonLd } from '@/lib/jsonLd'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'Global Trade — vizmaya',
  description:
    'Who exports what: goods exports by HS product for the world’s top exporters, 2001 onward, from UN Comtrade.',
  alternates: { canonical: '/global-trade' },
}

// Migration 064 seeds the epic row as draft and getEpic only returns
// published epics — fall back to a static descriptor so the page works
// while the epic stays hidden from listings.
const EPIC_FALLBACK = {
  slug: 'global-trade',
  name: 'Global Trade',
  description:
    'Who exports what: goods exports by HS product for the world’s top exporters, 2001 onward.',
  theme: {} as Record<string, unknown>,
}

export default async function GlobalTradePage() {
  const [epic, landscape, stories] = await Promise.all([
    getEpic('global-trade').catch(() => null),
    // Renders the empty-globe state when no importer has run yet instead of
    // 500-ing — same contingency as the AI-data-centers landing.
    getTradeLandscape().catch((err) => {
      console.warn(`global-trade: getTradeLandscape failed: ${err}`)
      return null
    }),
    getEpicStories('global-trade').catch(() => []),
  ])

  const theme = resolveGlobalTradeTheme(epic?.theme ?? EPIC_FALLBACK.theme)
  const mapStyle = resolveGlobalTradeMapStyle(epic?.theme ?? EPIC_FALLBACK.theme)

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
    { name: (epic ?? EPIC_FALLBACK).name, url: '/global-trade' },
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
      <GlobalTradeLanding
        epic={epic ?? EPIC_FALLBACK}
        landscape={landscape}
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
