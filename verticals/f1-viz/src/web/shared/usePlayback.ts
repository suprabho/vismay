'use client'

/**
 * Shared, capture-aware playback loop for the F1 telemetry modules
 * (f1:race-replay, f1:telemetry-clip, f1:track-3d).
 *
 * Extracted from the rAF loop that lived inline in RaceReplay.tsx so all three
 * animated modules share ONE timeline implementation — and one capture story.
 *
 * Capture / print mode (headless screenshot + PDF): the loop does NOT start.
 * Instead the playhead is seeked once to a deterministic position (the end of
 * the window by default) so the snapshot is stable and reproducible. This
 * replaces the donor's `motion/react useAnimationFrame` dependency, which isn't
 * available in this workspace.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type PlaybackSpeed = 1 | 1.5 | 2

export interface UsePlaybackOptions {
  /** Window start (ms from session t0). */
  t0Ms: number
  /** Hard window end (ms). */
  tEndMs: number
  /** Soft end the loop clamps to (e.g. the selected lap window). Defaults to tEndMs. */
  endMs?: number
  /** Begin playing as soon as the source is ready (ignored in capture/print). */
  autoPlay?: boolean
  /** VizRenderProps.mode — 'capture'|'print' freeze to a static playhead. */
  mode?: string
  initialSpeed?: PlaybackSpeed
  /** Where to freeze the playhead under capture: 'start' | 'end' | explicit ms. */
  capturePlayhead?: 'start' | 'end' | number
  /** Change this when the underlying session/source changes to reset the playhead. */
  resetKey?: unknown
}

export interface Playback {
  /** Imperative, per-frame playhead (read in rAF/draw without re-rendering). */
  currentTimeRef: React.MutableRefObject<number>
  /** Throttled playhead state (~10 Hz) for React-driven UI. */
  currentTimeMs: number
  playing: boolean
  speed: PlaybackSpeed
  /** Increments every frame / on seek — subscribe to trigger imperative redraws. */
  redrawSignal: number
  play: () => void
  pause: () => void
  toggle: () => void
  seek: (t: number) => void
  setSpeed: (s: PlaybackSpeed) => void
}

const EMIT_THROTTLE_MS = 100

export function usePlayback(opts: UsePlaybackOptions): Playback {
  const {
    t0Ms,
    tEndMs,
    autoPlay = false,
    mode,
    initialSpeed = 1,
    capturePlayhead = 'end',
    resetKey,
  } = opts
  const endMs = opts.endMs ?? tEndMs
  const isCapture = mode === 'capture' || mode === 'print'

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(initialSpeed)
  const [currentTimeMs, setCurrentTimeMs] = useState(t0Ms)
  const [redrawSignal, setRedrawSignal] = useState(0)

  const currentTimeRef = useRef(t0Ms)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const lastEmitRef = useRef(0)
  // endMs can change after data loads / lap window changes — read it live.
  const endRef = useRef(endMs)
  endRef.current = endMs

  // Reset the playhead when the source changes. In capture, seek to a fixed
  // playhead and never play.
  useEffect(() => {
    const playhead = isCapture
      ? capturePlayhead === 'start'
        ? t0Ms
        : capturePlayhead === 'end'
          ? endMs
          : capturePlayhead
      : t0Ms
    currentTimeRef.current = playhead
    lastEmitRef.current = playhead
    setCurrentTimeMs(playhead)
    setPlaying(!isCapture && autoPlay)
    setRedrawSignal((s) => s + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t0Ms, tEndMs, resetKey, isCapture])

  // rAF loop — never runs in capture/print.
  useEffect(() => {
    if (isCapture || !playing) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
      return
    }
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts

      let next = currentTimeRef.current + dt * speed
      const end = endRef.current
      if (next >= end) {
        next = end
        currentTimeRef.current = next
        lastEmitRef.current = next
        setCurrentTimeMs(next)
        setPlaying(false)
        setRedrawSignal((s) => s + 1)
        return
      }
      currentTimeRef.current = next
      setRedrawSignal((s) => s + 1)
      if (next - lastEmitRef.current >= EMIT_THROTTLE_MS) {
        lastEmitRef.current = next
        setCurrentTimeMs(next)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, isCapture])

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(t0Ms, Math.min(t, tEndMs))
      currentTimeRef.current = clamped
      lastEmitRef.current = clamped
      setCurrentTimeMs(clamped)
      setRedrawSignal((s) => s + 1)
    },
    [t0Ms, tEndMs],
  )

  const play = useCallback(() => {
    if (!isCapture) setPlaying(true)
  }, [isCapture])
  const pause = useCallback(() => setPlaying(false), [])
  const toggle = useCallback(() => {
    if (!isCapture) setPlaying((p) => !p)
  }, [isCapture])

  return {
    currentTimeRef,
    currentTimeMs,
    playing,
    speed,
    redrawSignal,
    play,
    pause,
    toggle,
    seek,
    setSpeed,
  }
}
