import type { Metadata } from 'next'
import { getAllStories } from '@vismay/content-source/content'
import { getHtmlStoryCards } from '@/lib/htmlStoryListing'
import AllStoriesClient, { type ArchiveStory } from '@/components/AllStoriesClient'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'All Stories — vizmaya',
  description:
    'The full archive of visual stories from Vizmaya Labs — scrollytelling, data essays, and reports on geopolitics, technology, and the asymmetries that reshape markets.',
  alternates: { canonical: '/stories' },
}

export default async function AllStoriesPage() {
  const [stories, htmlStories] = await Promise.all([getAllStories('vizmaya-fyi'), getHtmlStoryCards()])
  // HTML stories (/s/<slug>) first, newest first, as on the home grid.
  const archive: ArchiveStory[] = [
    ...htmlStories.map((s) => ({
      slug: s.slug,
      href: s.href,
      title: s.title,
      subtitle: s.subtitle,
      date: s.date,
      byline: s.byline ?? '',
      format: s.format,
    })),
    ...stories.map((s) => ({
      slug: s.slug,
      title: s.title,
      subtitle: s.subtitle,
      date: s.date,
      byline: s.byline ?? '',
    })),
  ]
  return <AllStoriesClient stories={archive} />
}
