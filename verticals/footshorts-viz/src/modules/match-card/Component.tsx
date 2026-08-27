'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { FsFrame } from '../../web/FsFrame'
import { pickFsBackground } from '../shared/background'
import type { MatchCardConfig } from './index'
import CompactLayout from './layouts/Compact'
import HorizontalLayout from './layouts/Horizontal'
import PortraitLayout from './layouts/Portrait'
import ScoreLayout from './layouts/Score'
import GridLayout from './layouts/Grid'

export default function MatchCardComponent({
  config,
  noteReady,
}: VizRenderProps<MatchCardConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  // Horizontal/portrait blend `backgroundImage` into their hero gradient already,
  // so don't also paint it as a frame backdrop (it'd render twice). Compact /
  // score / grid get the shared frame.
  const heroLayout = config.layout === 'horizontal' || config.layout === 'portrait'
  const background = heroLayout ? {} : pickFsBackground(config)

  return (
    <FsFrame {...background}>
      {config.layout === 'compact' ? (
        <CompactLayout config={config} />
      ) : config.layout === 'horizontal' ? (
        <HorizontalLayout config={config} />
      ) : config.layout === 'portrait' ? (
        <PortraitLayout config={config} />
      ) : config.layout === 'grid' ? (
        <GridLayout config={config} />
      ) : (
        <ScoreLayout config={config} />
      )}
    </FsFrame>
  )
}
