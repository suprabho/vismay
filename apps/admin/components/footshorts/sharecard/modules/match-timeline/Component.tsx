'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { MatchTimeline } from '@vismay/footshorts-viz/web'
import { useFootshortsEvents, useFootshortsFixtures } from '../dataContext'
import { MatchStyleCard } from '../shared'
import type { FsCardMatchTimelineConfig } from '../types'

/**
 * `fscard:match-timeline` — a match-type card heading the event timeline.
 * Reproduces ShareCardCanvas's MatchTimelineBody; resolves the fixture + events.
 */
export default function MatchTimelineCardComponent({
  config,
  noteReady,
}: VizRenderProps<FsCardMatchTimelineConfig>) {
  const { fixtures, meta } = useFootshortsFixtures(config.compKey)
  const events = useFootshortsEvents(config.fixtureId)
  const fixture = fixtures.find((f) => f.id === config.fixtureId) ?? null

  useEffect(() => {
    if (!fixture) return
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [fixture, noteReady])

  if (!fixture) return null
  const competitionName = meta?.name ?? ''

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-4 py-1">
      {config.matchStyle === 'tile' ? (
        <div className="flex min-h-0 flex-[2] items-center">
          <div className="w-full">
            <MatchStyleCard fixture={fixture} style="tile" competitionName={competitionName} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-[2]">
          <MatchStyleCard fixture={fixture} style={config.matchStyle} competitionName={competitionName} />
        </div>
      )}
      <div className="min-h-0 flex-[3] overflow-hidden">
        <MatchTimeline events={events} filter={config.eventFilter} />
      </div>
    </div>
  )
}
