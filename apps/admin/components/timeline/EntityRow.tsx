'use client'

import { useState } from 'react'
import { BEAT_COL_W, ROW_H, type AuthoredKf } from './timelineShape'

/**
 * One stage-entity row: a beat-wide cell per column, tinted across the
 * entity's lifetime span (`enterBeat`..`exitBeat`, inclusive) with a diamond
 * marker on any beat carrying authored keyframes. E2: the diamond is an HTML5
 * drag handle — dropping it on an empty cell in the same row moves the beat's
 * whole keyframe group (the parent gates legality via `canDrop`; other rows
 * never receive a non-null `drag`, so cross-row drops are impossible by
 * construction).
 */
export default function EntityRow({
  role,
  enterBeat,
  exitBeat,
  totalBeats,
  authored,
  selectedBeat,
  onSelectBeat,
  drag,
  canDrop,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  role: 'subject' | 'object'
  enterBeat: number
  exitBeat: number
  totalBeats: number
  authored: Record<number, AuthoredKf[]>
  selectedBeat: number | null
  onSelectBeat: (beat: number) => void
  /** Non-null only while a diamond from THIS row is being dragged. */
  drag: { fromBeat: number } | null
  canDrop: (toBeat: number) => boolean
  onDragStart: (fromBeat: number) => void
  onDragEnd: () => void
  onDrop: (toBeat: number) => void
}) {
  const [overBeat, setOverBeat] = useState<number | null>(null)
  const tint = role === 'subject' ? 'bg-sky-500/15' : 'bg-violet-500/10'
  return (
    <div className="flex border-b border-white/5" style={{ height: ROW_H }}>
      {Array.from({ length: totalBeats }, (_, beat) => {
        const present = beat >= enterBeat && beat <= exitBeat
        const kfs = authored[beat]
        const isSource = drag?.fromBeat === beat
        const validTarget = drag != null && canDrop(beat)
        const selected = selectedBeat === beat
        return (
          <button
            key={beat}
            type="button"
            onClick={() => onSelectBeat(beat)}
            style={{ width: BEAT_COL_W }}
            className={`relative shrink-0 border-r border-white/5 ${present ? tint : ''} ${
              selected ? 'ring-1 ring-inset ring-sky-300' : ''
            } ${validTarget && overBeat === beat ? 'ring-1 ring-inset ring-sky-300 bg-sky-500/10' : ''} hover:bg-white/5`}
            title={
              present ? (kfs ? 'authored keyframe — drag the diamond to move it' : 'interpolated') : 'not present'
            }
            onDragOver={(e) => {
              if (!validTarget) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setOverBeat(beat)
            }}
            onDragLeave={() => setOverBeat((b) => (b === beat ? null : b))}
            onDrop={(e) => {
              if (!validTarget) return
              e.preventDefault()
              setOverBeat(null)
              onDrop(beat)
            }}
          >
            {kfs && (
              <span
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', '') // required for Firefox
                  e.dataTransfer.effectAllowed = 'move'
                  onDragStart(beat)
                }}
                onDragEnd={() => {
                  setOverBeat(null)
                  onDragEnd()
                }}
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab ${
                  isSource ? 'opacity-40' : ''
                }`}
              >
                <span className="block h-2 w-2 rotate-45 bg-sky-300" />
                {kfs.length > 1 && (
                  <span className="absolute -right-2.5 -top-2 text-[9px] font-medium tabular-nums text-sky-300">
                    {kfs.length}
                  </span>
                )}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
