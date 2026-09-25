'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { PositionChart } from '../../web/PositionChart'
import type { PositionChartConfig } from './index'

export default function PositionChartVizComponent({
  config,
  noteReady,
}: VizRenderProps<PositionChartConfig>) {
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
      <div style={{ width: '100%', maxWidth: '720px', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <PositionChart
          raceLabel={config.raceLabel}
          lanes={config.lanes}
          totalLaps={config.totalLaps}
          lapWindow={
            config.lapFrom != null && config.lapTo != null
              ? { from: config.lapFrom, to: config.lapTo }
              : undefined
          }
          highlight={config.highlight}
          bands={config.bands}
        />
      </div>
    </div>
  )
}
