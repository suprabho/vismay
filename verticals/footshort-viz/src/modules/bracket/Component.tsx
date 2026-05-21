'use client'

import { useEffect, useMemo } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { Bracket } from '../../web/Bracket'
import { buildBracket } from '../../buildBracket'
import type { BracketConfig } from './index'

export default function BracketVizComponent({
  config,
  noteReady,
}: VizRenderProps<BracketConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  const bracket = useMemo(() => buildBracket(config.fixtures), [config.fixtures])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {bracket ? (
          <Bracket bracket={bracket} />
        ) : (
          <div style={{ opacity: 0.6, fontSize: 14 }}>
            No knockout fixtures in this configuration.
          </div>
        )}
      </div>
    </div>
  )
}
