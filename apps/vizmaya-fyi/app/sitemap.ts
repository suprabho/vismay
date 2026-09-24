import type { MetadataRoute } from 'next'
import { getStoryContent, getViewableStorySlugs } from '@vismay/content-source/content'
import { listEditions, listPublishedEpics } from '@vismay/content-source/epics'
import { listAuthors } from '@vismay/content-source/authors'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vizmaya.fyi'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, epics, authors, editions] = await Promise.all([
    getViewableStorySlugs(),
    listPublishedEpics(),
    // Best-effort: the sitemap must not 500 if the authors registry is
    // unavailable (e.g. before migration 057 is applied).
    listAuthors('vizmaya-fyi').catch(() => []),
    // Same for the daily snapshot editions (migration 078).
    listEditions(400).catch(() => []),
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

  // One stable URL per frozen edition, plus the /daily alias for the latest.
  const editionEntries: MetadataRoute.Sitemap = editions.map((e) => ({
    url: `${BASE_URL}/ai-daily/doom-v-boom/${e.date}`,
    lastModified: e.publishedAt ? new Date(e.publishedAt) : new Date(`${e.date}T09:00:00Z`),
    changeFrequency: 'never',
    priority: 0.7,
  }))
  if (editions.length > 0) {
    editionEntries.unshift({
      url: `${BASE_URL}/ai-daily/doom-v-boom`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.85,
    })
  }

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
    ...editionEntries,
    ...authorEntries,
    ...stories.filter((s): s is NonNullable<typeof s> => s !== null),
  ]
}
