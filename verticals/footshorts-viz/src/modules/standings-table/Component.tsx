'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { StandingsTable } from '../../web/StandingsTable'
import { FsFrame } from '../../web/FsFrame'
import { pickFsBackground } from '../shared/background'
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
    <FsFrame {...pickFsBackground(config)}>
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
          <StandingsTable rows={config.rows} linkBase="https://footshorts.com" />
        </div>
      </div>
    </FsFrame>
  )
}
