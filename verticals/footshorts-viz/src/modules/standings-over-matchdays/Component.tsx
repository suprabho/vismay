'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { StandingsOverMatchdays } from '../../web/StandingsOverMatchdays'
import type { StandingsOverMatchdaysConfig } from './index'

export default function StandingsOverMatchdaysVizComponent({
  config,
  mode,
  noteReady,
}: VizRenderProps<StandingsOverMatchdaysConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  // Animate for live viewing only — capture/print render the final, fully-drawn
  // frame so the headless snapshot can't freeze mid-draw. Both live modes
  // (scroll, and autoplay pages like the catalog / footshorts storyboards,
  // which mount every section up front) leave the chart on the component's
  // default 'in-view' trigger, so the draw starts when the chart scrolls into
  // the viewport — not on page load — and replays on each re-entry.
  const animate = mode !== 'capture' && mode !== 'print'

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
      <div style={{ width: '100%', maxWidth: '720px' }}>
        <StandingsOverMatchdays
          competitionLabel={config.competitionLabel}
          lanes={config.lanes}
          totalMatchdays={config.totalMatchdays}
          matchdayRange={config.matchdayRange}
          animate={animate}
          loop={config.loop}
          loopDelayMs={config.loopDelayMs}
        />
      </div>
    </div>
  )
}
