import { redirect } from 'next/navigation'
import { deskHeatTable, type DeskHeatTableRow } from '@vismay/html-stories/randomizerApi'
import { loadStoryStylePool } from '@vismay/html-stories/storyStyles'
import type { StylePool } from '@vismay/html-stories/styles'
import { listSpins } from '@vismay/randomizer/spins'
import { randomizersFor, type SpinRecord } from '@vismay/randomizer/types'
import { isAuthed } from '@/lib/adminAuth'
import { vizmayaPublicUrl } from '@/lib/publicSite'
import { RandomizerClient } from '@/components/randomizer/RandomizerClient'

export const dynamic = 'force-dynamic'

/**
 * The Vizmaya story randomizers (packages/randomizer, migrations 088, 093,
 * 094, 096, 098 and 099): one slot machine with eight reel sets (Desk, Atlas,
 * Epics, OCW Desk, Landmark Desk, The 100 Desk, Evidence Desk, Frontier
 * Desk). Spin draws a topic under the playbook's rules and logs it; the
 * composed agent brief carries the spin; the hero insight gate, the Desk
 * heat table, the OCW pool panel, the Landmark pool panel, The 100 profile
 * panel, the Evidence study panel and the Frontier paper panel live here
 * too. The OCW, Landmark, 100, Evidence and Frontier Desks need nothing
 * loaded up front: their pools, profiles and records are read per spin and
 * kept on the spin (the Frontier Desk's pool from AI Daily's dc_papers).
 */
export default async function RandomizerPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/randomizer')

  const [spinsResult, heatResult, poolResult] = await Promise.allSettled([
    listSpins({ randomizers: randomizersFor('vizmaya-fyi'), limit: 150 }),
    deskHeatTable(),
    loadStoryStylePool('vizmaya-fyi'),
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

  return <RandomizerClient initialSpins={spins} heat={heat} pool={pool} loadError={loadError} siteUrl={vizmayaPublicUrl} />
}
