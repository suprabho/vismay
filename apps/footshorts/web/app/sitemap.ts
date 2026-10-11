import type { MetadataRoute } from 'next';
import { listPublishedHtmlStories } from '@vismay/html-stories/htmlStories';
import { htmlStorySitemapEntries, siteOrigin } from '@vismay/html-stories/seo';
import { listStoryboards } from '@/lib/storyboards';

export const revalidate = 3600;

/**
 * The URLs a crawler can read without signing in: the editorial archive,
 * every published HTML story (/s/<slug>, server-rendered) and the native
 * storyboards. League / team / match pages are left out while they are
 * client-rendered or signed-in only; see docs/seo-editorial-strategy.md.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin('footshorts');
  // Best-effort: the sitemap must not 500 when the stories table is unreachable.
  const stories = await listPublishedHtmlStories('footshorts').catch(() => []);
  return [
    { url: `${origin}/editorial`, lastModified: stories[0] ? new Date(stories[0].updatedAt) : new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${origin}/feed`, changeFrequency: 'hourly', priority: 0.7 },
    { url: `${origin}/about-us`, changeFrequency: 'yearly', priority: 0.3 },
    ...listStoryboards().map((b) => ({
      url: `${origin}/editorial/native/${b.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...htmlStorySitemapEntries(stories),
  ];
}
