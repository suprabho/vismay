'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import type { VideoClip } from '@vismay/viz-admin'

/**
 * A single clip block on a timeline row: draggable body (move), draggable
 * left/right edges (trim), and faint head/tail markers for the enter/exit ramp
 * lengths. Positioned/sized in px by the parent (px = ms × scale).
 */
export function TimelineClip({
  clip,
  leftPx,
  widthPx,
  enterPx,
  exitPx,
  selected,
  onBodyDown,
  onTrimStartDown,
  onTrimEndDown,
}: {
  clip: VideoClip
  leftPx: number
  widthPx: number
  enterPx: number
  exitPx: number
  selected: boolean
  onBodyDown: (e: ReactPointerEvent) => void
  onTrimStartDown: (e: ReactPointerEvent) => void
  onTrimEndDown: (e: ReactPointerEvent) => void
}) {
  const tint =
    clip.layer.type === 'audio'
      ? 'bg-emerald-500/25'
      : clip.layer.type === 'text'
        ? 'bg-amber-500/25'
        : clip.layer.type === 'image'
          ? 'bg-violet-500/25'
          : 'bg-sky-500/25'

  return (
    <div
      onPointerDown={onBodyDown}
      className={`group absolute top-1 bottom-1 cursor-move select-none overflow-hidden rounded-md border ${tint} ${
        selected ? 'border-sky-300 ring-1 ring-sky-300/60' : 'border-white/15'
      }`}
      style={{ left: leftPx, width: widthPx }}
      title={`${clip.layer.type} · ${(clip.durationMs / 1000).toFixed(2)}s`}
    >
      {/* enter ramp marker (head) */}
      {enterPx > 1 && (
        <div
          className="pointer-events-none absolute left-0 top-0 h-full bg-white/10"
          style={{ width: enterPx }}
        />
      )}
      {/* exit ramp marker (tail) */}
      {exitPx > 1 && (
        <div
          className="pointer-events-none absolute right-0 top-0 h-full bg-white/10"
          style={{ width: exitPx }}
        />
      )}

      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 truncate pr-3 text-[10px] text-neutral-100">
        {clip.layer.type}
      </span>

      {/* trim handles */}
      <div
        onPointerDown={onTrimStartDown}
        className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/20 opacity-0 group-hover:opacity-100"
      />
      <div
        onPointerDown={onTrimEndDown}
        className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/20 opacity-0 group-hover:opacity-100"
      />
    </div>
  )
}
