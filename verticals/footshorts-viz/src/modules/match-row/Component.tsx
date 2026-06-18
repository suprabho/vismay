'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { MatchRow } from '../../web/MatchRow'
import { FsFrame } from '../../web/FsFrame'
import { pickFsBackground } from '../shared/background'
import type { MatchRowConfig } from './index'

// Web wrapper around the MatchRow component. Mobile rendering goes through
// the WebView shell in Footshorts, so a native VizModule variant isn't needed
// for v1.
export default function MatchRowVizComponent({
  config,
  noteReady,
}: VizRenderProps<MatchRowConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  // Stack mode renders several rows in one column; single mode is a one-element
  // stack. MatchRow draws the dividing border (`last:border-b-0` clears the tail).
  const rows = config.fixtures ?? (config.fixture ? [config.fixture] : [])

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
        <div style={{ width: '100%', maxWidth: '480px' }}>
          {rows.map((fixture, i) => (
            <MatchRow key={fixture.id || `row-${i}`} fixture={fixture} variant={config.variant} />
          ))}
        </div>
      </div>
    </FsFrame>
  )
}
