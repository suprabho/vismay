import type { Metadata } from 'next'
import { getAllStories } from '@vismay/content-source/content'
import { listEpicsForHome } from '@vismay/content-source/epics'
import HomeClient, { type HomeStory, type HomeEpic } from '@/components/HomeClient'

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
  }))
  const homeEpics: HomeEpic[] = epics.map((e) => ({
    slug: e.slug,
    name: e.name,
    description: e.description,
  }))
  return <HomeClient stories={homeStories} epics={homeEpics} />
}
