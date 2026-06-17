'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { MatchTimeline } from '../../web/MatchTimeline'
import type { MatchTimelineConfig } from './index'

export default function MatchTimelineVizComponent({
  config,
  noteReady,
}: VizRenderProps<MatchTimelineConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <MatchTimeline
          events={config.events}
          filter={config.filter ?? 'all'}
          emptyText={config.emptyText}
        />
      </div>
    </div>
  )
}
