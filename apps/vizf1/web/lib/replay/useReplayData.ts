'use client'

import { useEffect, useState } from 'react'
import type {
  AggregatesByDriverLap,
  CarPositionTrack,
  CircuitGeometry,
  SectorBests,
  SessionDetail,
} from './types'
import type { ReplayDataSource } from './dataSource'

export interface ReplayDataState {
  loading: boolean
  error: string | null
  session: SessionDetail | null
  circuit: CircuitGeometry | null
  tracks: Map<number, CarPositionTrack>
  /** Global t bounds across all driver tracks (min t0Ms, max tEndMs). */
  bounds: { t0Ms: number; tEndMs: number } | null
  /** Total lap count across all driver tracks. */
  totalLaps: number
  aggregates: AggregatesByDriverLap
  sectorBests: SectorBests | null
}

const EMPTY_TRACKS = new Map<number, CarPositionTrack>()
const EMPTY_AGGREGATES: AggregatesByDriverLap = new Map()

const IDLE: ReplayDataState = {
  loading: false,
  error: null,
  session: null,
  circuit: null,
  tracks: EMPTY_TRACKS,
  bounds: null,
  totalLaps: 0,
  aggregates: EMPTY_AGGREGATES,
  sectorBests: null,
}

/**
 * Load replay data for a session through a `ReplayDataSource`, then derive the
 * global time bounds + total lap count the playback loop needs.
 */
export function useReplayData(
  source: ReplayDataSource,
  sessionRef: string | null,
): ReplayDataState {
  const [state, setState] = useState<ReplayDataState>(IDLE)

  useEffect(() => {
    if (!sessionRef) {
      setState(IDLE)
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    source
      .load(sessionRef)
      .then((data) => {
        if (cancelled) return

        let minT = Infinity
        let maxT = -Infinity
        let maxLap = 0
        for (const track of data.tracks.values()) {
          if (track.t0Ms < minT) minT = track.t0Ms
          if (track.tEndMs > maxT) maxT = track.tEndMs
          const lastLap = track.frames.lap[track.frames.lap.length - 1] ?? 0
          if (lastLap > maxLap) maxLap = lastLap
        }

        setState({
          loading: false,
          error: null,
          session: data.session,
          circuit: data.circuit,
          tracks: data.tracks,
          bounds: data.tracks.size > 0 ? { t0Ms: minT, tEndMs: maxT } : null,
          totalLaps: maxLap,
          aggregates: data.aggregates,
          sectorBests: data.sectorBests,
        })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          ...IDLE,
          error: err instanceof Error ? err.message : 'Failed to load replay data',
        })
      })

    return () => {
      cancelled = true
    }
  }, [source, sessionRef])

  return state
}
