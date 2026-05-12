import type { MetadataRoute } from 'next'
import { getStoryContent, getViewableStorySlugs } from '@/lib/content'
import { listPublishedEpics } from '@/lib/epics'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vizmaya.fyi'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, epics] = await Promise.all([getViewableStorySlugs(), listPublishedEpics()])
  const stories = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const { frontmatter } = await getStoryContent(slug)
        const lastModified = new Date(frontmatter.date)
        return {
          url: `${BASE_URL}/story/${slug}`,
          lastModified: Number.isNaN(lastModified.getTime()) ? new Date() : lastModified,
          changeFrequency: 'monthly' as const,
          priority: 0.8,
        }
      } catch {
        return null
      }
    })
  )

  const epicEntries: MetadataRoute.Sitemap = epics.map((e) => ({
    url: `${BASE_URL}/${e.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.85,
  }))

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/stories`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...epicEntries,
    ...stories.filter((s): s is NonNullable<typeof s> => s !== null),
  ]
}
