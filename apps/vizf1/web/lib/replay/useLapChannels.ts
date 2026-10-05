'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Real car telemetry (speed, throttle, brake, gear, DRS) for one driver, read
 * from `/api/telemetry/<sessionKey>/clip` in lap chunks around the current lap.
 * Lap-telemetry `sessionTime` shares the position frames' time base (seconds
 * vs ms since session start), so a playhead in ms samples it directly.
 *
 * Fixture sessions have no channels: `sample` returns null and the card falls
 * back to values derived from the position tracks.
 */

export interface ChannelSample {
  speed: number | null
  throttle: number | null
  brake: number | null
  gear: number | null
  drs: number | null
}

interface LapTrace {
  lap: number
  sessionTime: number[]
  speed?: number[]
  throttle?: number[]
  brake?: number[]
  nGear?: number[]
  drs?: number[]
}

const CHUNK_LAPS = 3
const CHANNELS = 'speed,throttle,brake,nGear,drs'

function chunkStart(lap: number): number {
  return Math.floor((Math.max(1, lap) - 1) / CHUNK_LAPS) * CHUNK_LAPS + 1
}

function sampleTrace(trace: LapTrace, tSec: number): ChannelSample | null {
  const st = trace.sessionTime
  const n = st.length
  if (n === 0 || tSec < st[0] || tSec > st[n - 1]) return null
  let lo = 0
  let hi = n - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1
    if (st[mid] <= tSec) lo = mid
    else hi = mid
  }
  const span = st[hi] - st[lo]
  const u = span > 0 ? (tSec - st[lo]) / span : 0
  const lerp = (arr?: number[]) => (arr && arr.length === n ? arr[lo] + (arr[hi] - arr[lo]) * u : null)
  const nearest = (arr?: number[]) => (arr && arr.length === n ? arr[u < 0.5 ? lo : hi] : null)
  return {
    speed: lerp(trace.speed),
    throttle: lerp(trace.throttle),
    brake: nearest(trace.brake),
    gear: nearest(trace.nGear),
    drs: nearest(trace.drs),
  }
}

export function useLapChannels(sessionKey: string | null, driverNumber: number | null, lap: number) {
  // chunk key → traces (null = fetched, nothing there)
  const cache = useRef(new Map<string, LapTrace[] | null>())
  const [version, setVersion] = useState(0)

  useEffect(() => {
    cache.current = new Map()
    setVersion((v) => v + 1)
  }, [sessionKey, driverNumber])

  const from = chunkStart(lap)
  const enabled = !!sessionKey && driverNumber != null && lap >= 1
  useEffect(() => {
    if (!enabled || !sessionKey || driverNumber == null) return
    const key = `${driverNumber}:${from}`
    if (cache.current.has(key)) return
    cache.current.set(key, null)
    const ctrl = new AbortController()
    const qs = new URLSearchParams({
      drivers: String(driverNumber),
      lapFrom: String(from),
      lapTo: String(from + CHUNK_LAPS - 1),
      channels: CHANNELS,
      hz: '10',
    })
    fetch(`/api/telemetry/${encodeURIComponent(sessionKey)}/clip?${qs}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { telemetry?: Array<LapTrace & { driverNumber: number }> } | null) => {
        const traces = (json?.telemetry ?? []).filter((t) => t.driverNumber === driverNumber)
        cache.current.set(key, traces.length ? traces : null)
        setVersion((v) => v + 1)
      })
      .catch(() => {
        // Aborted (chunk/driver changed): forget it so it's refetched if needed again.
        if (ctrl.signal.aborted) cache.current.delete(key)
      })
    return () => ctrl.abort()
  }, [enabled, sessionKey, driverNumber, from])

  const sample = useCallback(
    (tMs: number): ChannelSample | null => {
      if (driverNumber == null) return null
      const traces = cache.current.get(`${driverNumber}:${chunkStart(lap)}`)
      if (!traces) return null
      const tSec = tMs / 1000
      for (const trace of traces) {
        const s = sampleTrace(trace, tSec)
        if (s) return s
      }
      return null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [driverNumber, lap, version],
  )

  return sample
}
