'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { TeamFormStrip } from '../../web/TeamFormStrip'
import type { TeamFormStripConfig } from './index'

export default function TeamFormStripVizComponent({
  config,
  noteReady,
}: VizRenderProps<TeamFormStripConfig>) {
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
      <div style={{ width: '100%', maxWidth: '640px' }}>
        <TeamFormStrip
          fixtures={config.fixtures}
          teamId={config.teamId}
          label={config.label}
        />
      </div>
    </div>
  )
}
