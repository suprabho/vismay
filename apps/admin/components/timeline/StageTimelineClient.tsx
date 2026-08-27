'use client'

import { useState } from 'react'
import type { StageConfig } from '@vismay/viz-engine'
import type { TimelineColumn, AuthoredKeyframeIndex, EntityLifetime } from './timelineShape'
import PreviewFrame from './PreviewFrame'
import BeatTimeline, { type Selection } from './BeatTimeline'
import InspectorPanel from './InspectorPanel'

/**
 * Client root for the E1 stage timeline: owns the playhead (drives the live
 * preview via `PreviewFrame`'s `viz-story-seek` bridge) and the cell
 * selection (drives `InspectorPanel`) as two independent pieces of state —
 * clicking a cell moves both, dragging the playhead moves only the former.
 */
export default function StageTimelineClient({
  slug,
  columns,
  stage,
  authoredIndex,
  lifetimes,
  previewUrl,
}: {
  slug: string
  columns: TimelineColumn[]
  stage: StageConfig | null
  authoredIndex: AuthoredKeyframeIndex
  lifetimes: EntityLifetime[]
  previewUrl: string
}) {
  const [playhead, setPlayhead] = useState<{ unit: number; t: number }>({ unit: 0, t: 0 })
  const [selection, setSelection] = useState<Selection | null>(null)

  return (
    <div className="flex h-screen flex-col gap-3 bg-neutral-950 p-3 text-neutral-100">
      <div className="flex items-center justify-between">
        <h1 className="text-[13px] font-medium text-neutral-300">
          Stage timeline — <span className="text-neutral-500">{slug}</span>
        </h1>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black">
          <PreviewFrame src={previewUrl} seek={playhead} />
        </div>
        <div className="w-[280px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/40">
          <InspectorPanel stage={stage} authoredIndex={authoredIndex} selection={selection} />
        </div>
      </div>

      <div className="h-[260px] shrink-0">
        <BeatTimeline
          columns={columns}
          lifetimes={lifetimes}
          authoredIndex={authoredIndex}
          playhead={playhead}
          selection={selection}
          onSeek={(unit, t) => setPlayhead({ unit, t })}
          onSelect={setSelection}
        />
      </div>
    </div>
  )
}
