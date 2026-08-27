'use client'

import {
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  ComposerSelection,
  VideoClip,
  VideoProjectSnapshot,
  VideoTrack,
} from '@vismay/viz-admin'
import { patchClip } from '../composer/projectToComposerState'
import { TimelineClip } from './TimelineClip'

/** Editor px per ms — the timeline's horizontal scale. */
const PX_PER_MS = 0.06
/** Left gutter px reserved for the track-name labels. */
const LABEL_W = 96
/** Row height per track. */
const ROW_H = 44

const msToPx = (ms: number) => ms * PX_PER_MS
const pxToMs = (px: number) => px / PX_PER_MS

/**
 * The bottom timeline: a time ruler + one row per track, each clip a block
 * positioned/sized by startMs/durationMs. Drag a clip body to move its start;
 * drag its edges to trim. A draggable playhead (and ruler clicks) seek. All
 * pointer math converts px deltas → ms via `PX_PER_MS`, adapted from the
 * share-card creator's px↔% drag handlers.
 */
export function TimelinePanel({
  snapshot,
  playheadMs,
  selection,
  onSeek,
  onSnapshotChange,
  onSelect,
}: {
  snapshot: VideoProjectSnapshot
  playheadMs: number
  selection: ComposerSelection
  onSeek: (ms: number) => void
  onSnapshotChange: (next: VideoProjectSnapshot) => void
  onSelect: (sel: ComposerSelection) => void
}) {
  const laneRef = useRef<HTMLDivElement>(null)

  // Tracks top-to-bottom: visual on top (highest index first), audio below.
  const orderedTracks = useMemo(
    () => [...snapshot.tracks].sort((a, b) => b.index - a.index),
    [snapshot.tracks],
  )

  const timelineWidthPx = Math.max(800, msToPx(snapshot.durationMs) + 120)

  const clipsByTrack = useMemo(() => {
    const m = new Map<string, VideoClip[]>()
    for (const t of snapshot.tracks) m.set(t.id, [])
    for (const c of snapshot.clips) m.get(c.trackId)?.push(c)
    return m
  }, [snapshot.tracks, snapshot.clips])

  // ── seek: click anywhere on the ruler / lane background ──────────────────
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = laneRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ms = Math.max(0, pxToMs(clientX - rect.left + el.scrollLeft))
      onSeek(Math.round(ms))
    },
    [onSeek],
  )

  // ── playhead drag ─────────────────────────────────────────────────────────
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
    [seekFromClientX],
  )

  // ── clip drag (move) / trim (edges) ─────────────────────────────────────
  // Each gesture captures the clip at pointer-down and recomputes from that
  // start snapshot on every move, so there's no drift (mirrors ShareCardCreator).
  const startClipGesture = useCallback(
    (clip: VideoClip, mode: 'move' | 'trim-start' | 'trim-end', e: ReactPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onSelect({ kind: 'layer', id: clip.id })
      const sx = e.clientX
      const start = clip
      const isMedia = start.layer.type === 'video' || start.layer.type === 'audio'
      const srcIn = start.sourceInMs ?? 0
      const move = (ev: PointerEvent) => {
        const dMs = Math.round(pxToMs(ev.clientX - sx))
        if (mode === 'move') {
          onSnapshotChange(patchClip(snapshot, start.id, { startMs: Math.max(0, start.startMs + dMs) }))
        } else if (mode === 'trim-start') {
          // Pull the head: clamp so duration stays >= 100ms; shift source-in too.
          const delta = Math.min(dMs, start.durationMs - 100)
          const newStart = Math.max(0, start.startMs + delta)
          const applied = newStart - start.startMs
          const patch: Partial<VideoClip> = {
            startMs: newStart,
            durationMs: start.durationMs - applied,
          }
          if (isMedia) patch.sourceInMs = Math.max(0, srcIn + applied)
          onSnapshotChange(patchClip(snapshot, start.id, patch))
        } else {
          // Pull the tail: clamp duration >= 100ms; extend source-out too.
          const newDur = Math.max(100, start.durationMs + dMs)
          const patch: Partial<VideoClip> = { durationMs: newDur }
          if (isMedia) patch.sourceOutMs = srcIn + newDur
          onSnapshotChange(patchClip(snapshot, start.id, patch))
        }
      }
      const end = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
    },
    [snapshot, onSnapshotChange, onSelect],
  )

  // ── ruler ticks (every second) ───────────────────────────────────────────
  const ticks = useMemo(() => {
    const out: number[] = []
    const totalSec = Math.ceil(snapshot.durationMs / 1000) + 2
    for (let s = 0; s <= totalSec; s++) out.push(s)
    return out
  }, [snapshot.durationMs])

  const selectedClipId = selection?.kind === 'layer' ? selection.id : null

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-neutral-950/40">
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-1.5">
        <span className="text-[11px] font-medium text-neutral-400">Timeline</span>
        <span className="text-[11px] tabular-nums text-neutral-500">
          {(playheadMs / 1000).toFixed(2)}s / {(snapshot.durationMs / 1000).toFixed(1)}s
        </span>
      </div>

      <div className="flex min-h-0 overflow-hidden">
        {/* fixed track-label gutter */}
        <div className="shrink-0 border-r border-white/10" style={{ width: LABEL_W }}>
          <div className="h-6 border-b border-white/10" />
          {orderedTracks.map((t) => (
            <TrackLabel key={t.id} track={t} />
          ))}
        </div>

        {/* scrollable lanes */}
        <div ref={laneRef} className="relative min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width: timelineWidthPx }}>
            {/* ruler */}
            <div
              className="relative h-6 cursor-pointer border-b border-white/10 bg-neutral-900/40"
              onPointerDown={(e) => {
                seekFromClientX(e.clientX)
                onPlayheadDown(e)
              }}
            >
              {ticks.map((s) => (
                <div
                  key={s}
                  className="absolute top-0 h-full border-l border-white/10"
                  style={{ left: msToPx(s * 1000) }}
                >
                  <span className="ml-1 text-[9px] tabular-nums text-neutral-500">{s}s</span>
                </div>
              ))}
            </div>

            {/* track rows */}
            {orderedTracks.map((track) => (
              <div
                key={track.id}
                className="relative border-b border-white/5"
                style={{ height: ROW_H }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) onSelect(null)
                }}
              >
                {(clipsByTrack.get(track.id) ?? []).map((clip) => (
                  <TimelineClip
                    key={clip.id}
                    clip={clip}
                    leftPx={msToPx(clip.startMs)}
                    widthPx={Math.max(8, msToPx(clip.durationMs))}
                    enterPx={msToPx(Math.min(clip.enterAnim.kind === 'none' ? 0 : clip.enterAnim.durationMs, clip.durationMs))}
                    exitPx={msToPx(Math.min(clip.exitAnim.kind === 'none' ? 0 : clip.exitAnim.durationMs, clip.durationMs))}
                    selected={selectedClipId === clip.id}
                    onBodyDown={(e) => startClipGesture(clip, 'move', e)}
                    onTrimStartDown={(e) => startClipGesture(clip, 'trim-start', e)}
                    onTrimEndDown={(e) => startClipGesture(clip, 'trim-end', e)}
                  />
                ))}
              </div>
            ))}

            {/* playhead spanning all rows */}
            <div
              className="pointer-events-none absolute top-0 z-20 w-px bg-sky-400"
              style={{ left: msToPx(playheadMs), height: 24 + orderedTracks.length * ROW_H }}
            >
              <div
                className="pointer-events-auto absolute -left-1.5 -top-0.5 h-3 w-3 cursor-ew-resize rounded-sm bg-sky-400"
                onPointerDown={onPlayheadDown}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrackLabel({ track }: { track: VideoTrack }) {
  return (
    <div className="flex items-center px-2 text-[11px] text-neutral-300" style={{ height: ROW_H }}>
      <span className="truncate">{track.name}</span>
      <span className="ml-1 text-neutral-600">{track.kind === 'audio' ? '♪' : ''}</span>
    </div>
  )
}
