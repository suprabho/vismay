'use client'

import { useEffect, useMemo } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { RaceReplay } from '../../web/replay/RaceReplay'
import { createFixtureDataSource, createInlineDataSource } from '../../web/replay/dataSource'
import type { RaceReplayConfig } from './index'

export default function RaceReplayVizComponent({
  config,
  mode,
  noteReady,
}: VizRenderProps<RaceReplayConfig>) {
  // Inline fixture → no-network source; otherwise a URL/sessionRef fixture source.
  const source = useMemo(() => {
    if (config.fixture) return createInlineDataSource(config.fixture)
    return createFixtureDataSource({
      resolveUrl: config.fixtureUrl ? () => config.fixtureUrl as string : undefined,
      fallbackRef: config.fallbackRef ?? 'demo',
    })
  }, [config.fixture, config.fixtureUrl, config.fallbackRef])

  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  const autoPlay = config.autoPlay ?? (mode === 'autoplay' || mode === 'scroll')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.75rem',
        overflow: 'auto',
      }}
    >
      {config.title && (
        <h3 className="shrink-0 text-sm font-semibold text-text">{config.title}</h3>
      )}
      <RaceReplay
        sessionRef={config.sessionRef ?? 'sample'}
        dataSource={source}
        autoPlay={autoPlay}
      />
    </div>
  )
}
