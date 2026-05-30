'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { StandingsOverMatchdays } from '../../web/StandingsOverMatchdays'
import type { StandingsOverMatchdaysConfig } from './index'

export default function StandingsOverMatchdaysVizComponent({
  config,
  mode,
  noteReady,
}: VizRenderProps<StandingsOverMatchdaysConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  // Animate for live viewing only — capture/print render the final, fully-drawn
  // frame so the headless snapshot can't freeze mid-draw.
  const animate = mode !== 'capture' && mode !== 'print'

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
          animate={animate}
        />
      </div>
    </div>
  )
}
