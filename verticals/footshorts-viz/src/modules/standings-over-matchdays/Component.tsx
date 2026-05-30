'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { StandingsOverMatchdays } from '../../web/StandingsOverMatchdays'
import type { StandingsOverMatchdaysConfig } from './index'

export default function StandingsOverMatchdaysVizComponent({
  config,
  noteReady,
}: VizRenderProps<StandingsOverMatchdaysConfig>) {
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
      }}
    >
      <div style={{ width: '100%', maxWidth: '720px' }}>
        <StandingsOverMatchdays
          competitionLabel={config.competitionLabel}
          lanes={config.lanes}
          totalMatchdays={config.totalMatchdays}
        />
      </div>
    </div>
  )
}
