'use client'

import { BEAT_COL_W, ROW_H } from './timelineShape'

/**
 * One stage-entity row: a beat-wide cell per column, tinted across the
 * entity's lifetime span (`enterBeat`..`exitBeat`, inclusive) with a diamond
 * marker on any beat carrying an authored keyframe. Mirrors the freeform
 * video editor's `TimelineClip` in spirit (a span + enter/exit visual cue)
 * but beats-axis and grid-cell-based rather than absolute-positioned px.
 */
export default function EntityRow({
  role,
  enterBeat,
  exitBeat,
  totalBeats,
  authoredBeats,
  selectedBeat,
  onSelectBeat,
}: {
  role: 'subject' | 'object'
  enterBeat: number
  exitBeat: number
  totalBeats: number
  authoredBeats: Set<number>
  selectedBeat: number | null
  onSelectBeat: (beat: number) => void
}) {
  const tint = role === 'subject' ? 'bg-sky-500/15' : 'bg-violet-500/10'
  return (
    <div className="flex border-b border-white/5" style={{ height: ROW_H }}>
      {Array.from({ length: totalBeats }, (_, beat) => {
        const present = beat >= enterBeat && beat <= exitBeat
        const authored = authoredBeats.has(beat)
        const selected = selectedBeat === beat
        return (
          <button
            key={beat}
            type="button"
            onClick={() => onSelectBeat(beat)}
            style={{ width: BEAT_COL_W }}
            className={`relative shrink-0 border-r border-white/5 ${present ? tint : ''} ${
              selected ? 'ring-1 ring-inset ring-sky-300' : ''
            } hover:bg-white/5`}
            title={present ? (authored ? 'authored keyframe' : 'interpolated') : 'not present'}
          >
            {authored && (
              <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-sky-300" />
            )}
          </button>
        )
      })}
    </div>
  )
}
