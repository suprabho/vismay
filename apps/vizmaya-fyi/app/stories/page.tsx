import type { Metadata } from 'next'
import { getAllStories } from '@vismay/content-source/content'
import { getHtmlStoryCards } from '@/lib/htmlStoryListing'
import AllStoriesClient, { type ArchiveStory } from '@/components/AllStoriesClient'
import { STORY_CATEGORIES, parseStoryCategory } from '@vismay/html-stories/categories'
import { VIZ_STORY_CATEGORIES } from '@/lib/home/vizStoryCategories'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'All Stories — vizmaya',
  description:
    'The full archive of visual stories from Vizmaya Labs — scrollytelling, data essays, and reports on geopolitics, technology, and the asymmetries that reshape markets.',
  alternates: { canonical: '/stories' },
}

/** The archive, or with `?category=<id>` one category of it (the home page's sections link here). */
export default async function AllStoriesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const category = parseStoryCategory((await searchParams).category)
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
      category: s.category,
    })),
    ...stories.map((s) => ({
      slug: s.slug,
      title: s.title,
      subtitle: s.subtitle,
      date: s.date,
      byline: s.byline ?? '',
      category: VIZ_STORY_CATEGORIES[s.slug],
    })),
  ]
  const categories = STORY_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: archive.filter((s) => s.category === c.id).length })).filter(
    (c) => c.count > 0
  )
  return (
    <AllStoriesClient
      stories={category ? archive.filter((s) => s.category === category) : archive}
      total={archive.length}
      categories={categories}
      category={category}
    />
  )
}
