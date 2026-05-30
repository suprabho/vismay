'use client'

import { useEffect, useMemo } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { Bracket } from '../../web/Bracket'
import { BracketTree } from '../../web/BracketTree'
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
  const isTree = config.layout === 'tree'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: isTree ? 'center' : 'flex-start',
        justifyContent: 'center',
        padding: '1rem',
        overflowX: isTree ? 'auto' : undefined,
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: isTree ? '100%' : '520px' }}>
        {bracket ? (
          isTree ? (
            <BracketTree
              bracket={bracket}
              highlightTeamId={config.highlightTeamId}
              title={config.title}
              competitionSlug={config.competitionSlug ?? bracket.competition_slug}
            />
          ) : (
            <Bracket bracket={bracket} />
          )
        ) : (
          <div style={{ opacity: 0.6, fontSize: 14 }}>
            No knockout fixtures in this configuration.
          </div>
        )}
      </div>
    </div>
  )
}
