'use client'

import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  BEAT_COL_W,
  ROW_H,
  HEADER_H,
  type TimelineColumn,
  type AuthoredKeyframeIndex,
  type EntityLifetime,
} from './timelineShape'
import EntityRow from './EntityRow'

export interface Selection {
  entityId: string
  beat: number
}

/**
 * The beats-axis grid: a header row of `TimelineColumn`s, one `EntityRow`
 * per stage entity lifetime, and a draggable playhead — a beats-axis mirror
 * of `TimelinePanel.tsx`'s ms-axis pointer-drag gesture (window-level
 * `pointermove`/`pointerup`, position mapped back to a continuous value on
 * every move). Clicking a cell both selects it (for the inspector) and
 * seeks the preview to that exact beat, so the two never desync.
 */
export default function BeatTimeline({
  columns,
  lifetimes,
  authoredIndex,
  playhead,
  selection,
  onSeek,
  onSelect,
}: {
  columns: TimelineColumn[]
  lifetimes: EntityLifetime[]
  authoredIndex: AuthoredKeyframeIndex
  playhead: { unit: number; t: number }
  selection: Selection | null
  onSeek: (unit: number, t: number) => void
  onSelect: (selection: Selection) => void
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const totalBeats = columns.length

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = gridRef.current
      if (!el || totalBeats === 0) return
      const rect = el.getBoundingClientRect()
      const beatPos = (clientX - rect.left + el.scrollLeft) / BEAT_COL_W
      const unit = Math.max(0, Math.min(totalBeats - 1, Math.floor(beatPos)))
      const t = Math.max(0, Math.min(1, beatPos - unit))
      onSeek(unit, unit === totalBeats - 1 ? 0 : t)
    },
    [totalBeats, onSeek]
  )

  const onPlayheadDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const move = (ev: PointerEvent) => seekFromClientX(ev.clientX)
      const end = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
    },
    [seekFromClientX]
  )

  const handleSelectBeat = useCallback(
    (entityId: string, beat: number) => {
      onSelect({ entityId, beat })
      onSeek(beat, 0)
    },
    [onSelect, onSeek]
  )

  const timelineWidthPx = totalBeats * BEAT_COL_W
  const playheadLeft = (playhead.unit + playhead.t) * BEAT_COL_W

  const authoredBeatsByEntity = useMemo(() => {
    const m = new Map<string, Set<number>>()
    for (const lt of lifetimes) {
      const byBeat = authoredIndex[lt.id] ?? {}
      m.set(lt.id, new Set(Object.keys(byBeat).map(Number)))
    }
    return m
  }, [lifetimes, authoredIndex])

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-neutral-950/40">
      <div ref={gridRef} className="relative min-w-0 flex-1 overflow-x-auto">
        <div className="relative" style={{ width: Math.max(timelineWidthPx, 800) }}>
          {/* header: beat columns */}
          <div
            className="relative flex cursor-pointer border-b border-white/10 bg-neutral-900/40"
            style={{ height: HEADER_H }}
            onPointerDown={(e) => {
              seekFromClientX(e.clientX)
              onPlayheadDown(e)
            }}
          >
            {columns.map((col) => (
              <div
                key={col.unit}
                className={`flex flex-col justify-center overflow-hidden px-2 ${
                  col.isSectionStart ? 'border-l-2 border-l-sky-400/50' : 'border-l border-l-white/5'
                }`}
                style={{ width: BEAT_COL_W }}
              >
                <span className="truncate text-[11px] font-medium text-neutral-200">
                  {col.heading ?? col.sectionId}
                </span>
                <span className="truncate text-[10px] text-neutral-500">
                  {col.clock === 'scrubbed' ? `scrubbed · runway ${col.runway ?? 1}` : 'triggered'}
                </span>
              </div>
            ))}
          </div>

          {/* entity rows */}
          {lifetimes.map((lt) => (
            <EntityRow
              key={lt.id}
              role={lt.role}
              enterBeat={lt.enterBeat}
              exitBeat={lt.exitBeat}
              totalBeats={totalBeats}
              authoredBeats={authoredBeatsByEntity.get(lt.id) ?? new Set()}
              selectedBeat={selection?.entityId === lt.id ? selection.beat : null}
              onSelectBeat={(beat) => handleSelectBeat(lt.id, beat)}
            />
          ))}

          {/* playhead spanning all rows */}
          <div
            className="pointer-events-none absolute top-0 z-20 w-px bg-sky-400"
            style={{ left: playheadLeft, height: HEADER_H + lifetimes.length * ROW_H }}
          >
            <div
              className="pointer-events-auto absolute -left-1.5 -top-0.5 h-3 w-3 cursor-ew-resize rounded-sm bg-sky-400"
              onPointerDown={onPlayheadDown}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
