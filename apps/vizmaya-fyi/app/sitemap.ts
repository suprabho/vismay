import type { MetadataRoute } from 'next'
import { getStoryContent, getViewableStorySlugs } from '@vismay/content-source/content'
import { listPublishedEpics } from '@vismay/content-source/epics'
import { listAuthors } from '@vismay/content-source/authors'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vizmaya.fyi'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, epics, authors] = await Promise.all([
    getViewableStorySlugs(),
    listPublishedEpics(),
    // Best-effort: the sitemap must not 500 if the authors registry is
    // unavailable (e.g. before migration 057 is applied).
    listAuthors('vizmaya-fyi').catch(() => []),
  ])
  const stories = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const { frontmatter } = await getStoryContent(slug)
        // Prefer the explicit last-edit date; fall back to publish date.
        const lastModified = new Date(frontmatter.dateModified ?? frontmatter.date)
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

  const authorEntries: MetadataRoute.Sitemap = authors.map((a) => ({
    url: `${BASE_URL}/authors/${a.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.5,
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
    ...authorEntries,
    ...stories.filter((s): s is NonNullable<typeof s> => s !== null),
  ]
}
