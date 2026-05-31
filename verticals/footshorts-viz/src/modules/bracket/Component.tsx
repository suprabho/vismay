'use client'

import { useEffect, useMemo, useState } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { Bracket } from '../../web/Bracket'
import { BracketTree } from '../../web/BracketTree'
import { BracketTreeVertical } from '../../web/BracketTreeVertical'
import { buildBracket } from '../../buildBracket'
import type { BracketConfig } from './index'

// Below this width the mirrored (horizontal) tree forces horizontal scrolling,
// so the `tree` layout falls back to the vertical top-to-bottom bracket.
const NARROW_QUERY = '(max-width: 640px)'

// SSR/capture-safe: starts false (horizontal) so server render and the
// Playwright/Chromium capture pipeline keep the wide tree; only a real narrow
// client viewport flips it to the vertical layout.
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(NARROW_QUERY)
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return narrow
}

export default function BracketVizComponent({
  config,
  noteReady,
}: VizRenderProps<BracketConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  const bracket = useMemo(() => buildBracket(config.fixtures), [config.fixtures])
  const isNarrow = useIsNarrow()
  const isTreeFamily = config.layout === 'tree' || config.layout === 'tree-vertical'
  const isVertical = config.layout === 'tree-vertical' || (config.layout === 'tree' && isNarrow)
  const isTree = isTreeFamily && !isVertical

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
          ) : isVertical ? (
            <BracketTreeVertical
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
