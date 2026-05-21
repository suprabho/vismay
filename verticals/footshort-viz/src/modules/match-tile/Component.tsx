'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { MatchTile } from '../../web/MatchTile'
import type { MatchTileConfig } from './index'

export default function MatchTileVizComponent({
  config,
  noteReady,
}: VizRenderProps<MatchTileConfig>) {
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
      <div style={{ width: '100%', maxWidth: '320px' }}>
        <MatchTile
          fixture={config.fixture}
          competitionCrest={config.competitionCrest ?? null}
        />
      </div>
    </div>
  )
}
