'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { TeamCalendar } from '../../web/TeamCalendar'
import { FsFrame } from '../../web/FsFrame'
import { pickFsBackground } from '../shared/background'
import type { TeamCalendarConfig } from './index'

export default function TeamCalendarVizComponent({
  config,
  noteReady,
}: VizRenderProps<TeamCalendarConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

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
          // Size container so the grid can also be capped by the frame's height.
          containerType: 'size',
        }}
      >
        {/* Seven columns of crest cells — the same ceiling as the form grid — but
            a month is roughly as tall as it is wide (5–6 rows + heading + legend),
            so also cap the width against the frame's height or a 6-row month
            overflows a landscape layer area. */}
        <div style={{ width: '100%', maxWidth: 'min(640px, 88cqh)' }}>
          <TeamCalendar
            fixtures={config.fixtures}
            teamId={config.teamId}
            month={config.month}
            label={config.label}
            weekStart={config.weekStart}
            showScores={config.showScores}
            showLegend={config.showLegend}
            teamColor={config.teamColor}
          />
        </div>
      </div>
    </FsFrame>
  )
}
