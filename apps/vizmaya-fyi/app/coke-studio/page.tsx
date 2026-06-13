import type { Metadata } from 'next'
import { getEpic, getEpicStories } from '@vismay/content-source/epics'
import {
  getCokeStudioCorpusStats,
  listCokeStudioPlaces,
} from '@/lib/coke-studio/data'
import CokeStudioLanding from './CokeStudioLanding'
import { resolveCokeStudioMapStyle, resolveCokeStudioTheme } from './theme'
import EpicSeoBlock from '@/components/epic/EpicSeoBlock'
import JsonLd from '@/components/JsonLd'
import { buildEpicJsonLd, buildBreadcrumbJsonLd } from '@/lib/jsonLd'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'Coke Studio Pakistan — vizmaya',
  description:
    'Fifteen seasons of Coke Studio Pakistan, mapped by the places its lyrics keep coming home to.',
  alternates: { canonical: '/coke-studio' },
}

type SearchParams = Record<string, string | string[] | undefined>

function num(v: string | string[] | undefined): number | undefined {
  const s = Array.isArray(v) ? v[0] : v
  if (s === undefined || s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function bool(v: string | string[] | undefined): boolean {
  const s = Array.isArray(v) ? v[0] : v
  return s === '1' || s === 'true'
}

export default async function CokeStudioPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [epic, places, stories, stats, sp] = await Promise.all([
    getEpic('coke-studio'),
    listCokeStudioPlaces(),
    getEpicStories('coke-studio'),
    getCokeStudioCorpusStats(),
    searchParams,
  ])

  if (!epic) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400 px-6 text-center">
        <p className="text-sm font-mono">
          Coke Studio epic not seeded. Apply migrations 046 + 048.
        </p>
      </div>
    )
  }

  const theme = resolveCokeStudioTheme(epic.theme)
  const mapStyle = resolveCokeStudioMapStyle(epic.theme)

  // ?lng=&lat=&zoom=&pitch=&bearing= override the default camera; ?embed=1
  // strips the header + story footer for iframe embeds. Same shape as the
  // other epic landings — keeps the admin embed previewer one component.
  const initialView = {
    longitude: num(sp.lng),
    latitude: num(sp.lat),
    zoom: num(sp.zoom),
    pitch: num(sp.pitch),
    bearing: num(sp.bearing),
  }

  const isEmbed = bool(sp.embed)

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
      {/* Skip structured data + pillar block in iframe embeds. */}
      {!isEmbed && (
        <JsonLd data={[...(Array.isArray(epicJsonLd) ? epicJsonLd : [epicJsonLd]), breadcrumbJsonLd]} />
      )}
      <CokeStudioLanding
        epic={epic}
        places={places}
        stories={stories}
        stats={stats}
        theme={theme}
        mapStyle={mapStyle}
        embed={isEmbed}
        initialView={initialView}
      />
      {!isEmbed && (
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
