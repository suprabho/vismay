'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** The UI readouts (scrubber, lap) follow the race clock at this rate. */
const UI_TICK_MS = 100

/**
 * The race clock the 3D view reads every frame (`timeRef`, ms of session time),
 * with a ~10 Hz copy in state for the scrubber and lap readout. Stops at the
 * end of the race.
 */
export function useRaceClock(bounds: { t0Ms: number; tEndMs: number } | null) {
  const timeRef = useRef(0)
  const [timeMs, setTimeMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const boundsRef = useRef(bounds)
  useEffect(() => {
    boundsRef.current = bounds
    if (bounds) {
      timeRef.current = bounds.t0Ms
      setTimeMs(bounds.t0Ms)
    }
  }, [bounds])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last: number | null = null
    let lastEmit = 0
    const tick = (ts: number) => {
      const end = boundsRef.current?.tEndMs ?? 0
      timeRef.current = Math.min(end, timeRef.current + (last == null ? 0 : ts - last))
      last = ts
      if (ts - lastEmit >= UI_TICK_MS || timeRef.current >= end) {
        lastEmit = ts
        setTimeMs(timeRef.current)
      }
      if (timeRef.current >= end) {
        setPlaying(false)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const seek = useCallback((t: number) => {
    const b = boundsRef.current
    const clamped = b ? Math.min(b.tEndMs, Math.max(b.t0Ms, t)) : t
    timeRef.current = clamped
    setTimeMs(clamped)
  }, [])
  const play = useCallback(() => setPlaying(true), [])
  const pause = useCallback(() => setPlaying(false), [])
  const toggle = useCallback(() => {
    const b = boundsRef.current
    // Play from the end of the race starts it over.
    if (!playing && b && timeRef.current >= b.tEndMs) seek(b.t0Ms)
    setPlaying(!playing)
  }, [playing, seek])

  return { timeRef, timeMs, playing, seek, play, pause, toggle }
}
