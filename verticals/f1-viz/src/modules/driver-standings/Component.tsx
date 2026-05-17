'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { DriverStandings } from '../../web/DriverStandings'
import type { DriverStandingsConfig } from './index'

export default function DriverStandingsVizComponent({
  config,
  noteReady,
}: VizRenderProps<DriverStandingsConfig>) {
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
        <DriverStandings rows={config.rows} />
      </div>
    </div>
  )
}
