'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { StandingsTable } from '../../web/StandingsTable'
import type { StandingsTableConfig } from './index'

export default function StandingsTableVizComponent({
  config,
  noteReady,
}: VizRenderProps<StandingsTableConfig>) {
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
        <StandingsTable rows={config.rows} compact />
      </div>
    </div>
  )
}
