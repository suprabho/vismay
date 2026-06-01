import type { Metadata } from 'next'
import { getAllStories } from '@vismay/content-source/content'
import { listEpicsForHome } from '@vismay/content-source/epics'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import HomeClient, { type HomeStory, type HomeEpic } from '@/components/HomeClient'

type FontSet = { serif?: string; sans?: string; mono?: string }

export const revalidate = 0

export const metadata: Metadata = {
  title: 'vizmaya — Visual Stories',
  description:
    'Data-driven narratives on geopolitics, technology, and the asymmetries that reshape markets.',
  alternates: { canonical: '/' },
}

export default async function HomePage() {
  const [stories, epics] = await Promise.all([
    getAllStories('vizmaya-fyi'),
    listEpicsForHome('vizmaya-fyi'),
  ])
  const homeStories: HomeStory[] = stories.map((s) => ({
    slug: s.slug,
    title: s.title,
    subtitle: s.subtitle,
    date: s.date,
    byline: s.byline ?? '',
    aura: s.aura,
    theme: s.theme,
    topic: s.topic,
    thumbnail: s.thumbnail,
    thumbnailTextColor: s.thumbnailTextColor,
  }))
  const homeEpics: HomeEpic[] = epics.map((e) => ({
    slug: e.slug,
    name: e.name,
    description: e.description,
    theme: e.theme,
  }))

  // Each story/epic card renders in its own theme's typefaces, so collect every
  // distinct font set and resolve the Google Fonts links to load.
  const fontSets: FontSet[] = []
  for (const s of homeStories) if (s.theme?.fonts) fontSets.push(s.theme.fonts)
  for (const e of homeEpics) {
    const f = e.theme?.fonts as FontSet | undefined
    if (f) fontSets.push(f)
  }
  const fontUrls = Array.from(
    new Set(fontSets.map((f) => getFontImportUrl(f)).filter((u): u is string => Boolean(u)))
  )

  return <HomeClient stories={homeStories} epics={homeEpics} fontUrls={fontUrls} />
}
