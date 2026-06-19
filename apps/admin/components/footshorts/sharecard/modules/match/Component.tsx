'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { useFootshortsFixtures } from '../dataContext'
import { MatchStyleCard } from '../shared'
import type { FsCardMatchConfig } from '../types'

/** `fscard:match` — a single fixture as the colorful tile or an editorial card.
 *  Reproduces ShareCardCanvas's MatchBody; resolves the fixture by id. */
export default function MatchCardComponent({ config, noteReady }: VizRenderProps<FsCardMatchConfig>) {
  const { fixtures, meta } = useFootshortsFixtures(config.compKey)
  const fixture = fixtures.find((f) => f.id === config.fixtureId) ?? null

  useEffect(() => {
    if (!fixture) return
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [fixture, noteReady])

  if (!fixture) return null
  const competitionName = meta?.name ?? ''

  if (config.matchStyle === 'tile') {
    return (
      <div className="flex h-full min-h-0 flex-col justify-center gap-4 px-4">
        <div className="text-center text-[15px] font-semibold uppercase tracking-wide text-muted">
          {competitionName}
        </div>
        <div className="w-full">
          <MatchStyleCard fixture={fixture} style="tile" competitionName={competitionName} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-3 py-2">
      <MatchStyleCard fixture={fixture} style={config.matchStyle} competitionName={competitionName} />
    </div>
  )
}
