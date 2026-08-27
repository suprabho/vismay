'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { TeamFormStrip } from '../../web/TeamFormStrip'
import { FsFrame } from '../../web/FsFrame'
import { pickFsBackground } from '../shared/background'
import type { TeamFormStripConfig } from './index'

export default function TeamFormStripVizComponent({
  config,
  noteReady,
}: VizRenderProps<TeamFormStripConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  // Grids fan out wider than a single strip, so give them more room to breathe.
  const maxWidth = config.layout === 'grid' ? '900px' : '640px'

  return (
    <FsFrame {...pickFsBackground(config)}>
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
        <div style={{ width: '100%', maxWidth }}>
          <TeamFormStrip
            fixtures={config.fixtures}
            teamId={config.teamId}
            label={config.label}
            layout={config.layout}
            columns={config.columns}
            rows={config.rows}
            cardWidth={config.cardWidth}
          />
        </div>
      </div>
    </FsFrame>
  )
}
