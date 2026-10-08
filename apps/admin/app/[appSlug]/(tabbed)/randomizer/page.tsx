import { notFound, redirect } from 'next/navigation'
import { loadStoryStylePool } from '@vismay/html-stories/storyStyles'
import type { StylePool } from '@vismay/html-stories/styles'
import { latestTrendsOrNull } from '@vismay/randomizer/trendsServer'
import { listSpins, loadFootshortsNews } from '@vismay/randomizer/spins'
import { randomizersFor, type FootshortsNews, type SpinRecord } from '@vismay/randomizer/types'
import { isAuthed } from '@/lib/adminAuth'
import { htmlStoriesBasePath } from '@/lib/htmlStoryApps'
import { footshortsPublicUrl } from '@/lib/publicSite'
import { RandomizerClient } from '@/components/randomizer/RandomizerClient'

export const dynamic = 'force-dynamic'

/**
 * The Football Desk (footshorts only; packages/randomizer, migrations 088 and
 * 090): the same slot machine as /vizmaya/randomizer with one reel set
 * (tournament, team, angle, freshness, plus the head-to-head opponent),
 * weighted by the live footshorts news table shown under it.
 */
export default async function FootballRandomizerPage({ params }: { params: Promise<{ appSlug: string }> }) {
  const { appSlug } = await params
  if (appSlug !== 'footshorts') notFound()
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/randomizer`)

  const [spinsResult, newsResult, poolResult, trendsResult] = await Promise.allSettled([
    listSpins({ randomizers: randomizersFor('footshorts'), limit: 150 }),
    loadFootshortsNews(),
    loadStoryStylePool('footshorts'),
    latestTrendsOrNull(),
  ])
  const spins: SpinRecord[] = spinsResult.status === 'fulfilled' ? spinsResult.value : []
  const loadError =
    spinsResult.status === 'rejected'
      ? spinsResult.reason instanceof Error
        ? spinsResult.reason.message
        : 'could not read the spin log'
      : null
  const news: FootshortsNews | null = newsResult.status === 'fulfilled' ? newsResult.value : null
  if (newsResult.status === 'rejected') console.error('[randomizer] footshorts news failed', newsResult.reason)
  const pool: StylePool | null = poolResult.status === 'fulfilled' ? poolResult.value : null
  const trends = trendsResult.status === 'fulfilled' ? trendsResult.value : null

  return (
    <RandomizerClient
      app="footshorts"
      initialSpins={spins}
      news={news}
      trends={trends}
      pool={pool}
      loadError={loadError}
      siteUrl={footshortsPublicUrl}
      storiesBasePath={htmlStoriesBasePath('footshorts')}
    />
  )
}
