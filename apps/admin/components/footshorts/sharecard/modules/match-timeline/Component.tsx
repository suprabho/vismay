'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { MatchTimeline } from '@vismay/footshorts-viz/web'
import { useFootshortsEvents, useFootshortsFixtures } from '../dataContext'
import type { FsCardMatchTimelineConfig } from '../types'

/**
 * `fscard:match-timeline` — the match event timeline (goals / cards / subs).
 * Resolves the fixture's events against the injected FootshortsDataProvider; the
 * fixture is resolved only to gate readiness on the competition's data load.
 */
export default function MatchTimelineCardComponent({
  config,
  noteReady,
}: VizRenderProps<FsCardMatchTimelineConfig>) {
  const { fixtures } = useFootshortsFixtures(config.compKey)
  const events = useFootshortsEvents(config.fixtureId)
  const fixture = fixtures.find((f) => f.id === config.fixtureId) ?? null

  useEffect(() => {
    if (!fixture) return
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [fixture, noteReady])

  if (!fixture) return null

  return (
    <div className="h-full min-h-0 overflow-hidden px-4 py-2">
      <MatchTimeline events={events} filter={config.eventFilter} />
    </div>
  )
}
