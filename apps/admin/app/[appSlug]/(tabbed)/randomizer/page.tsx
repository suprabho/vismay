import { notFound, redirect } from 'next/navigation'
import { loadStoryStylePool } from '@vismay/html-stories/storyStyles'
import type { StylePool } from '@vismay/html-stories/styles'
import { listSpins, loadFootshortsNews, loadViznbaNews } from '@vismay/randomizer/spins'
import { randomizersFor, type FootshortsNews, type SpinRecord, type ViznbaNews } from '@vismay/randomizer/types'
import { isAuthed } from '@/lib/adminAuth'
import { htmlStoriesBasePath } from '@/lib/htmlStoryApps'
import { footshortsPublicUrl, viznbaPublicUrl } from '@/lib/publicSite'
import { RandomizerClient } from '@/components/randomizer/RandomizerClient'

export const dynamic = 'force-dynamic'

/**
 * The per-app randomizers (packages/randomizer; migrations 088, 090 and 092),
 * the same slot machine as /vizmaya/randomizer with one reel set each:
 *
 * - footshorts, the Football Desk: tournament, team, angle, freshness, plus
 *   the head-to-head opponent, weighted by the live footshorts news table
 *   shown under it.
 * - viznba, the NBA Desk: conference, franchise, angle, freshness, plus the
 *   head-to-head opponent, weighted by the news tagged on VizNBA, with each
 *   team's games from ESPN's schedule.
 *
 * Other apps 404.
 */
export default async function AppRandomizerPage({ params }: { params: Promise<{ appSlug: string }> }) {
  const { appSlug } = await params
  if (appSlug !== 'footshorts' && appSlug !== 'viznba') notFound()
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/randomizer`)
  const app = appSlug

  const [spinsResult, newsResult, poolResult] = await Promise.allSettled([
    listSpins({ randomizers: randomizersFor(app), limit: 150 }),
    app === 'footshorts' ? loadFootshortsNews() : loadViznbaNews(),
    loadStoryStylePool(app),
  ])
  const spins: SpinRecord[] = spinsResult.status === 'fulfilled' ? spinsResult.value : []
  const loadError =
    spinsResult.status === 'rejected'
      ? spinsResult.reason instanceof Error
        ? spinsResult.reason.message
        : 'could not read the spin log'
      : null
  const news = newsResult.status === 'fulfilled' ? newsResult.value : null
  if (newsResult.status === 'rejected') console.error(`[randomizer] ${app} news failed`, newsResult.reason)
  const pool: StylePool | null = poolResult.status === 'fulfilled' ? poolResult.value : null

  return (
    <RandomizerClient
      app={app}
      initialSpins={spins}
      news={app === 'footshorts' ? (news as FootshortsNews | null) : null}
      nbaNews={app === 'viznba' ? (news as ViznbaNews | null) : null}
      pool={pool}
      loadError={loadError}
      siteUrl={app === 'footshorts' ? footshortsPublicUrl : viznbaPublicUrl}
      storiesBasePath={htmlStoriesBasePath(app)}
    />
  )
}
