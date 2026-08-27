'use client'

import { useEffect, useMemo } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { TrackScene3D } from '../../web/three/TrackScene3D'
import { createFixtureDataSource, createInlineDataSource } from '../../web/replay/dataSource'
import { useReplayData } from '../../web/replay/useReplayData'
import { findFrameIndex } from '../../web/replay/trackProjection'
import { usePlayback } from '../../web/shared/usePlayback'
import { AlertIcon, PauseIcon, PlayIcon, SpinnerIcon } from '../../web/replay/icons'
import type { ProcessedLap } from '../../web/replay/types'
import type { Track3DConfig } from './index'

const EMPTY_LAPS: ProcessedLap[] = []

export default function Track3DComponent({ config, mode, noteReady }: VizRenderProps<Track3DConfig>) {
  const isCapture = mode === 'capture' || mode === 'print'

  const source = useMemo(() => {
    if (config.fixture) return createInlineDataSource(config.fixture)
    if (config.sessionKey) {
      const base = config.apiBase ?? ''
      return createFixtureDataSource({
        resolveUrl: (ref) => `${base}/api/replay/${encodeURIComponent(ref)}`,
        fallbackRef: config.fallbackRef ?? 'demo',
      })
    }
    return createFixtureDataSource({
      resolveUrl: config.fixtureUrl ? () => config.fixtureUrl as string : undefined,
      fallbackRef: config.fallbackRef ?? 'demo',
    })
  }, [config.fixture, config.sessionKey, config.apiBase, config.fixtureUrl, config.fallbackRef])

  const sessionRef = config.sessionKey ?? config.sessionRef ?? 'sample'
  const race = useReplayData(source, sessionRef)

  const playback = usePlayback({
    t0Ms: race.bounds?.t0Ms ?? 0,
    tEndMs: race.bounds?.tEndMs ?? 0,
    autoPlay: config.autoPlay ?? (mode === 'autoplay' || mode === 'scroll'),
    mode,
    capturePlayhead: race.bounds ? Math.round((race.bounds.t0Ms + race.bounds.tEndMs) / 2) : 'end',
    resetKey: race.tracks,
  })

  // Belt-and-braces readiness: TrackScene3D also fires onReady after first frame.
  useEffect(() => {
    if (race.loading) return
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [race.loading, noteReady])

  const visibleDrivers = useMemo(() => new Set(race.tracks.keys()), [race.tracks])
  const focusedDriver = config.focalDriverNumber ?? null

  const currentLap = useMemo(() => {
    if (race.tracks.size === 0) return 0
    const anchor = race.tracks.values().next().value
    if (!anchor) return 0
    const idx = findFrameIndex(anchor.frames.t, playback.currentTimeMs)
    return idx >= 0 ? anchor.frames.lap[idx] : 0
  }, [race.tracks, playback.currentTimeMs])

  const interactive = (config.interactive ?? false) && !isCapture
  const chaseCam = (config.chaseCam ?? false) && !isCapture

  if (race.loading) {
    return (
      <div className="flex h-full min-h-[420px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface text-muted">
        <SpinnerIcon size={16} className="animate-spin" />
        <span className="font-mono text-xs">Loading track…</span>
      </div>
    )
  }
  if (race.error) {
    return (
      <div className="flex h-full min-h-[420px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface text-muted">
        <AlertIcon size={20} className="text-accent" />
        <span className="max-w-md text-center font-mono text-xs">{race.error}</span>
      </div>
    )
  }
  if (race.tracks.size === 0) {
    return (
      <div className="flex h-full min-h-[420px] w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface">
        <span className="font-mono text-xs text-muted">No replay data for this session yet.</span>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-2 p-3">
      {config.title && <h3 className="shrink-0 text-sm font-semibold text-text">{config.title}</h3>}
      <div
        className="relative min-h-[380px] flex-1 overflow-hidden rounded-xl border border-border"
        style={{ pointerEvents: interactive ? 'auto' : 'none' }}
      >
        <TrackScene3D
          circuit={race.circuit}
          drivers={race.session?.drivers ?? []}
          tracks={race.tracks}
          visibleDrivers={visibleDrivers}
          focusedDriver={focusedDriver}
          focusedLaps={EMPTY_LAPS}
          sectorBests={race.sectorBests}
          currentLap={currentLap}
          currentTimeRef={playback.currentTimeRef}
          chaseCam={chaseCam}
          interactive={interactive}
          onReady={noteReady}
        />
      </div>
      {race.bounds && !isCapture && (
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={playback.toggle}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-text text-bg transition-colors hover:bg-accent"
          >
            {playback.playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <input
            type="range"
            min={race.bounds.t0Ms}
            max={race.bounds.tEndMs}
            step={50}
            value={playback.currentTimeMs}
            onChange={(e) => playback.seek(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-accent"
          />
          <span className="shrink-0 font-mono text-[10px] text-muted">LAP {currentLap}</span>
        </div>
      )}
    </div>
  )
}
