import type { MetadataRoute } from 'next'
import { listPublishedHtmlStories } from '@vismay/html-stories/htmlStories'
import { htmlStorySitemapEntries, siteOrigin } from '@vismay/html-stories/seo'

export const revalidate = 3600

/**
 * The URLs a crawler can read without running the app: the editorial index and
 * every published HTML story (/s/<slug>, server-rendered). /editorial/<slug>
 * (an iframe of the render service) and the client-rendered driver / team /
 * race pages are left out until they render their content on the server; see
 * docs/seo-editorial-strategy.md.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin('vizf1')
  // Best-effort: the sitemap must not 500 when the stories table is unreachable.
  const stories = await listPublishedHtmlStories('vizf1').catch(() => [])
  return [
    { url: `${origin}/editorial`, lastModified: stories[0] ? new Date(stories[0].updatedAt) : new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${origin}/feed`, changeFrequency: 'hourly', priority: 0.7 },
    { url: `${origin}/about-us`, changeFrequency: 'yearly', priority: 0.3 },
    ...htmlStorySitemapEntries(stories),
  ]
}
