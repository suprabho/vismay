import type { Metadata } from 'next'
import { getAllStories } from '@/lib/content'
import AllStoriesClient, { type ArchiveStory } from '@/components/AllStoriesClient'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'All Stories — vizmaya',
  description:
    'The full archive of visual stories from Vizmaya Labs — scrollytelling, data essays, and reports on geopolitics, technology, and the asymmetries that reshape markets.',
  alternates: { canonical: '/stories' },
}

export default async function AllStoriesPage() {
  const stories = await getAllStories()
  const archive: ArchiveStory[] = stories.map((s) => ({
    slug: s.slug,
    title: s.title,
    subtitle: s.subtitle,
    date: s.date,
    byline: s.byline ?? '',
  }))
  return <AllStoriesClient stories={archive} />
}
