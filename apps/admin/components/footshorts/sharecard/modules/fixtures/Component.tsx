'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { MatchRow } from '@vismay/footshorts-viz/web'
import { useCardRatio, useFootshortsFixtures } from '../dataContext'
import { maxFixtureRows, withProxiedFixtureCrests } from '../shared'
import type { FsCardFixturesConfig } from '../types'

/** `fscard:fixtures` — a list of scoreboard rows. Reproduces ShareCardCanvas's
 *  FixturesBody; renders the picked fixtures in kickoff order, capped to ratio. */
export default function FixturesCardComponent({
  config,
  noteReady,
}: VizRenderProps<FsCardFixturesConfig>) {
  const ratio = useCardRatio()
  const { fixtures, meta } = useFootshortsFixtures(config.compKey)

  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  // Render in the fixtures' natural (kickoff) order, not pick order.
  const picked = fixtures
    .filter((f) => config.fixtureIds.includes(f.id))
    .slice(0, maxFixtureRows(ratio, config.variant))
  if (picked.length === 0) return null

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3">
      <div className="text-[14px] font-semibold uppercase tracking-wide text-muted">
        {meta?.name ?? ''}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {picked.map((f) => (
          <MatchRow key={f.id} fixture={withProxiedFixtureCrests(f)} variant={config.variant} />
        ))}
      </div>
    </div>
  )
}
