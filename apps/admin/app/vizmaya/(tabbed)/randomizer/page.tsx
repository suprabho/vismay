import { redirect } from 'next/navigation'
import { deskHeatTable, type DeskHeatTableRow } from '@vismay/html-stories/randomizerApi'
import { loadStoryStylePool } from '@vismay/html-stories/storyStyles'
import type { StylePool } from '@vismay/html-stories/styles'
import { latestTrendsOrNull } from '@vismay/randomizer/trendsServer'
import { listSpins } from '@vismay/randomizer/spins'
import { randomizersFor, type SpinRecord } from '@vismay/randomizer/types'
import { isAuthed } from '@/lib/adminAuth'
import { vizmayaPublicUrl } from '@/lib/publicSite'
import { RandomizerClient } from '@/components/randomizer/RandomizerClient'

export const dynamic = 'force-dynamic'

/**
 * The Vizmaya story randomizers (packages/randomizer, migration 088): one
 * slot machine with three reel sets (Desk, Atlas, Epics). Spin draws a topic
 * under the playbook's rules and logs it; the composed agent brief carries
 * the spin; the hero insight gate, the Desk heat table and what is trending
 * today (the daily Xpoz snapshot) live here too.
 */
export default async function RandomizerPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/randomizer')

  const [spinsResult, heatResult, poolResult, trendsResult] = await Promise.allSettled([
    listSpins({ randomizers: randomizersFor('vizmaya-fyi'), limit: 150 }),
    deskHeatTable(),
    loadStoryStylePool('vizmaya-fyi'),
    latestTrendsOrNull(),
  ])
  const spins: SpinRecord[] = spinsResult.status === 'fulfilled' ? spinsResult.value : []
  const loadError =
    spinsResult.status === 'rejected'
      ? spinsResult.reason instanceof Error
        ? spinsResult.reason.message
        : 'could not read the spin log'
      : null
  const heat: DeskHeatTableRow[] | null = heatResult.status === 'fulfilled' ? heatResult.value : null
  // The style die is optional: without a pool the brief keeps the house style.
  const pool: StylePool | null = poolResult.status === 'fulfilled' ? poolResult.value : null
  const trends = trendsResult.status === 'fulfilled' ? trendsResult.value : null

  return <RandomizerClient initialSpins={spins} heat={heat} trends={trends} pool={pool} loadError={loadError} siteUrl={vizmayaPublicUrl} />
}
