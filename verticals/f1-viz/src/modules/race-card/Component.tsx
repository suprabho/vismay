'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import type { RaceCardConfig } from './index'
import CompactLayout from './layouts/Compact'
import HorizontalLayout from './layouts/Horizontal'
import PortraitLayout from './layouts/Portrait'
import ScoreLayout from './layouts/Score'

export default function RaceCardComponent({
  config,
  noteReady,
}: VizRenderProps<RaceCardConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  switch (config.layout) {
    case 'compact':
      return <CompactLayout config={config} />
    case 'horizontal':
      return <HorizontalLayout config={config} />
    case 'portrait':
      return <PortraitLayout config={config} />
    case 'score':
    default:
      return <ScoreLayout config={config} />
  }
}
