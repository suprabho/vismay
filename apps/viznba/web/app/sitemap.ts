import type { MetadataRoute } from 'next'
import { htmlStorySitemapEntries, siteOrigin } from '@vismay/html-stories/seo'
import { scoreboard } from '@/lib/espn'
import { htmlStories } from '@/lib/htmlStories'
import { addDays, ET, todayKey } from '@/lib/time'

export const revalidate = 3600

/** How far back finished games are listed; older box scores are found through links. */
const GAME_DAYS = 7

/**
 * The editorial index and standings, every published HTML story (/s/<slug>),
 * and the last week's finished games (server-rendered box scores and recaps).
 * The cookie-personalised For you / Your teams pages are left out (noindex).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin('viznba')
  const today = todayKey(ET)
  const [stories, days] = await Promise.all([
    htmlStories(),
    Promise.all(Array.from({ length: GAME_DAYS }, (_, i) => scoreboard(addDays(today, -i)).catch(() => []))),
  ])
  const games: MetadataRoute.Sitemap = days
    .flat()
    .filter((g) => g.state === 'post')
    .map((g) => ({ url: `${origin}/game/${g.id}`, lastModified: new Date(g.date), changeFrequency: 'monthly', priority: 0.5 }))
  return [
    { url: `${origin}/`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${origin}/editorial`, lastModified: stories[0] ? new Date(stories[0].updatedAt) : new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${origin}/editorial/standings`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${origin}/calendar`, changeFrequency: 'daily', priority: 0.6 },
    ...htmlStorySitemapEntries(stories),
    ...games,
  ]
}
