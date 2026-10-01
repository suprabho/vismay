'use client'

import { useEffect, useMemo } from 'react'
import { resolveAssetUrl, type VizRenderProps } from '@vismay/viz-engine'
import { TrackScene3D } from '../../web/three/TrackScene3D'
import { DEFAULT_CAR_MODEL_URL } from '../../web/three/carModel'
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

  // Lap window → time window on the focal (else first visible) car's frames,
  // so the 3D view plays the same stretch of race as the 2D clip.
  const { lapFrom, lapTo } = config
  const windowMs = useMemo(() => {
    if (!race.bounds) return null
    if (lapFrom == null && lapTo == null) return race.bounds
    const pick = config.focalDriverNumber ?? config.driverNumbers?.[0]
    const ref = (pick != null ? race.tracks.get(pick) : undefined) ?? race.tracks.values().next().value
    if (!ref) return race.bounds
    const lo = lapFrom ?? 1
    const hi = lapTo ?? Infinity
    let t0 = Infinity
    let t1 = -Infinity
    for (let i = 0; i < ref.frames.t.length; i++) {
      const lap = ref.frames.lap[i]
      if (lap < lo || lap > hi) continue
      if (ref.frames.t[i] < t0) t0 = ref.frames.t[i]
      if (ref.frames.t[i] > t1) t1 = ref.frames.t[i]
    }
    return t0 < t1 ? { t0Ms: t0, tEndMs: t1 } : race.bounds
  }, [race.bounds, race.tracks, lapFrom, lapTo, config.focalDriverNumber, config.driverNumbers])

  const playback = usePlayback({
    t0Ms: windowMs?.t0Ms ?? 0,
    tEndMs: windowMs?.tEndMs ?? 0,
    autoPlay: config.autoPlay ?? (mode === 'autoplay' || mode === 'scroll'),
    mode,
    capturePlayhead: windowMs ? Math.round((windowMs.t0Ms + windowMs.tEndMs) / 2) : 'end',
    resetKey: race.tracks,
  })

  // Belt-and-braces readiness: TrackScene3D also fires onReady after first frame.
  useEffect(() => {
    if (race.loading) return
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [race.loading, noteReady])

  const visibleDrivers = useMemo(() => {
    const only = config.driverNumbers?.length ? new Set(config.driverNumbers) : null
    return new Set([...race.tracks.keys()].filter((n) => !only || only.has(n)))
  }, [race.tracks, config.driverNumbers])
  const focusedDriver = config.focalDriverNumber ?? null

  const currentLap = useMemo(() => {
    if (race.tracks.size === 0) return 0
    const anchor = race.tracks.values().next().value
    if (!anchor) return 0
    const idx = findFrameIndex(anchor.frames.t, playback.currentTimeMs)
    return idx >= 0 ? anchor.frames.lap[idx] : 0
  }, [race.tracks, playback.currentTimeMs])

  const interactive = (config.interactive ?? false) && !isCapture
  // Capture/print keeps the deterministic static overview framing.
  const cameraMode = isCapture ? 'orbit' : config.cameraMode ?? (config.chaseCam ? 'chase' : 'orbit')
  const cameraControls = (config.cameraControls ?? interactive) && !isCapture

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
          carModelUrl={config.carModelUrl ? resolveAssetUrl(config.carModelUrl) : DEFAULT_CAR_MODEL_URL}
          circuit={race.circuit}
          drivers={race.session?.drivers ?? []}
          tracks={race.tracks}
          visibleDrivers={visibleDrivers}
          focusedDriver={focusedDriver}
          focusedLaps={EMPTY_LAPS}
          sectorBests={race.sectorBests}
          currentLap={currentLap}
          currentTimeRef={playback.currentTimeRef}
          cameraMode={cameraMode}
          cameraControls={cameraControls}
          interactive={interactive}
          onReady={noteReady}
        />
      </div>
      {windowMs && !isCapture && (
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (playback.currentTimeMs >= windowMs.tEndMs) playback.seek(windowMs.t0Ms)
              playback.toggle()
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-text text-bg transition-colors hover:bg-accent"
          >
            {playback.playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <input
            type="range"
            min={windowMs.t0Ms}
            max={windowMs.tEndMs}
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
