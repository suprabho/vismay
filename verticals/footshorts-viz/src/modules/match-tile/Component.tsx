'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { MatchTile } from '../../web/MatchTile'
import { FsFrame } from '../../web/FsFrame'
import { pickFsBackground } from '../shared/background'
import { capToGrid, fsGridStyle } from '../shared/grid'
import type { MatchTileConfig } from './index'

export default function MatchTileVizComponent({
  config,
  noteReady,
}: VizRenderProps<MatchTileConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  const isGrid = config.layout === 'grid'
  const columns = isGrid && config.columns && config.columns > 0 ? config.columns : 2
  const fixtures = capToGrid(config.fixtures ?? [], columns, config.rows)

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
        {isGrid ? (
          // Grids fan out wider than a single tile, so give them more room.
          <div style={{ width: '100%', maxWidth: '900px' }}>
            <div style={fsGridStyle(columns, config.cardWidth)}>
              {fixtures.map((f) => (
                <MatchTile
                  key={f.id}
                  fixture={f}
                  competitionCrest={config.competitionCrest ?? null}
                />
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              maxWidth: config.cardWidth ? `${config.cardWidth}px` : '320px',
            }}
          >
            {config.fixture ? (
              <MatchTile
                fixture={config.fixture}
                competitionCrest={config.competitionCrest ?? null}
              />
            ) : null}
          </div>
        )}
      </div>
    </FsFrame>
  )
}
