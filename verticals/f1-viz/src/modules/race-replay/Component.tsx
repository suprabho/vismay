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
  // Source selection (in priority order):
  //   1. inline fixture → no network
  //   2. sessionKey → real telemetry from the Supabase replay route
  //   3. fixtureUrl / sessionRef → static fixture (catalog/back-compat)
  // All three resolve to the same `ReplayFixture` wire shape, so the render
  // layer is unaware of the origin.
  const source = useMemo(() => {
    if (config.fixture) return createInlineDataSource(config.fixture)
    if (config.sessionKey) {
      const base = config.apiBase ?? ''
      return createFixtureDataSource({
        resolveUrl: (ref) => `${base}/api/replay/${encodeURIComponent(ref)}`,
        fallbackRef: config.fallbackRef ?? 'demo',
      })
    }
    return createFixtureDataSource({
      resolveUrl: config.fixtureUrl ? () => config.fixtureUrl as string : undefined,
      fallbackRef: config.fallbackRef ?? 'demo',
    })
  }, [config.fixture, config.sessionKey, config.apiBase, config.fixtureUrl, config.fallbackRef])

  // The ref the source resolves: prefer the real session key.
  const sessionRef = config.sessionKey ?? config.sessionRef ?? 'sample'

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
        sessionRef={sessionRef}
        dataSource={source}
        autoPlay={autoPlay}
      />
    </div>
  )
}
