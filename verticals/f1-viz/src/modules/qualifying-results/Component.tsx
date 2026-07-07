'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { QualifyingResults } from '../../web/QualifyingResults'
import type { QualifyingResultsConfig } from './index'

export default function QualifyingResultsVizComponent({
  config,
  noteReady,
}: VizRenderProps<QualifyingResultsConfig>) {
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
        <QualifyingResults rows={config.rows} sessionLabel={config.sessionLabel} />
      </div>
    </div>
  )
}
