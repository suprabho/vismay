'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TrackViewport } from './TrackViewport'
import { DriverToggleList, type StandingsSortMode } from './DriverToggleList'
import { PlaybackControls, type PlaybackSpeed } from './PlaybackControls'
import { FocusedDriverCard } from './FocusedDriverCard'
import { AlertIcon, SpinnerIcon } from './icons'
import { createFixtureDataSource } from '@/lib/replay/dataSource'
import { useReplayData } from '@/lib/replay/useReplayData'
import { computeLiveStandings, findFrameIndex, timeAtLapStart } from '@/lib/replay/trackProjection'
import type { ProcessedLap } from '@/lib/replay/types'

interface RaceReplayProps {
  /** Session reference passed to the data source (resolves to a fixture / table row). */
  sessionRef: string
}

export function RaceReplay({ sessionRef }: RaceReplayProps) {
  // Source selection. Default is fixture-backed (any round falls back to the
  // shared demo fixture). When NEXT_PUBLIC_VIZF1_REPLAY_SOURCE=supabase, fetch
  // real ingested telemetry from /api/replay/<ref>, still falling back to the
  // demo fixture if a session hasn't been ingested yet.
  const source = useMemo(() => {
    if (process.env.NEXT_PUBLIC_VIZF1_REPLAY_SOURCE === 'supabase') {
      return createFixtureDataSource({
        resolveUrl: (ref) => `/api/replay/${encodeURIComponent(ref)}`,
        fallbackRef: 'demo',
      })
    }
    return createFixtureDataSource({ fallbackRef: 'demo' })
  }, [])
  const race = useReplayData(source, sessionRef)

  // ── Playback state ──────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const [redrawSignal, setRedrawSignal] = useState(0)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const currentTimeRef = useRef(0)

  const [lapFrom, setLapFrom] = useState(1)
  const [lapTo, setLapTo] = useState(1)

  const [visibleDrivers, setVisibleDrivers] = useState<Set<number>>(new Set())
  const [focusedDriver, setFocusedDriver] = useState<number | null>(null)
  const [sortMode, setSortMode] = useState<StandingsSortMode>('live')
  const [sortModeUserSet, setSortModeUserSet] = useState(false)

  // No driver-laps source in v1 → sector classification stays neutral.
  const focusedLaps: ProcessedLap[] = useMemo(() => [], [])

  const withPositions = useMemo(() => new Set(race.tracks.keys()), [race.tracks])

  // Reset playback state when a new session loads
  useEffect(() => {
    if (!race.bounds || race.tracks.size === 0) return
    currentTimeRef.current = race.bounds.t0Ms
    setCurrentTimeMs(race.bounds.t0Ms)
    setPlaying(false)
    setLapFrom(1)
    setLapTo(race.totalLaps || 1)
    setVisibleDrivers(new Set(race.tracks.keys()))
    setFocusedDriver(null)
    setSortMode('live')
    setSortModeUserSet(false)
    setRedrawSignal((s) => s + 1)
  }, [race.bounds, race.tracks, race.totalLaps])

  // ── Animation loop ──────────────────────────────────────────────────────────
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  useEffect(() => {
    if (!playing || !race.bounds) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
      return
    }

    const lapWindowEndMs = (() => {
      let end = race.bounds.t0Ms
      for (const track of race.tracks.values()) {
        const lapEnd = timeAtLapStart(track, lapTo + 1) ?? track.tEndMs
        if (lapEnd > end) end = lapEnd
      }
      return Math.min(end, race.bounds.tEndMs)
    })()

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts

      currentTimeRef.current += dt * speed
      if (currentTimeRef.current >= lapWindowEndMs) {
        currentTimeRef.current = lapWindowEndMs
        setCurrentTimeMs(currentTimeRef.current)
        setPlaying(false)
        setRedrawSignal((s) => s + 1)
        return
      }

      setRedrawSignal((s) => s + 1)
      if (Math.floor(currentTimeRef.current / 100) !== Math.floor(currentTimeMs / 100)) {
        setCurrentTimeMs(currentTimeRef.current)
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
  }, [playing, speed, race.bounds, race.tracks, lapTo])

  // ── Derived: current lap from an anchor driver ──────────────────────────────
  const currentLap = useMemo(() => {
    if (race.tracks.size === 0) return 0
    const anchor = race.tracks.values().next().value
    if (!anchor) return 0
    const idx = findFrameIndex(anchor.frames.t, currentTimeMs)
    return idx >= 0 ? anchor.frames.lap[idx] : 0
  }, [currentTimeMs, race.tracks])

  const focusedDriverObj = useMemo(
    () => race.session?.drivers.find((d) => d.driverNumber === focusedDriver) ?? null,
    [race.session, focusedDriver],
  )

  // Live race position per driver, recomputed at the 100 ms cadence of currentTimeMs.
  const liveStandings = useMemo(
    () => computeLiveStandings(race.tracks, currentTimeMs, race.circuit),
    [race.tracks, currentTimeMs, race.circuit],
  )

  // Auto-switch to live ordering on first play; respect manual override afterwards.
  useEffect(() => {
    if (playing && !sortModeUserSet) setSortMode('live')
  }, [playing, sortModeUserSet])

  const handleSortModeChange = useCallback((m: StandingsSortMode) => {
    setSortMode(m)
    setSortModeUserSet(true)
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSeek = useCallback((t: number) => {
    currentTimeRef.current = t
    setCurrentTimeMs(t)
    setRedrawSignal((s) => s + 1)
  }, [])

  const handleSkipToStart = useCallback(() => {
    if (!race.bounds || race.tracks.size === 0) return
    const anchor = race.tracks.values().next().value
    const t = (anchor && timeAtLapStart(anchor, lapFrom)) ?? race.bounds.t0Ms
    handleSeek(t)
  }, [race.bounds, race.tracks, lapFrom, handleSeek])

  const handleSkipToEnd = useCallback(() => {
    if (!race.bounds || race.tracks.size === 0) return
    let end = race.bounds.t0Ms
    for (const track of race.tracks.values()) {
      const lapEnd = timeAtLapStart(track, lapTo + 1) ?? track.tEndMs
      if (lapEnd > end) end = lapEnd
    }
    handleSeek(Math.min(end, race.bounds.tEndMs))
  }, [race.bounds, race.tracks, lapTo, handleSeek])

  const toggleDriver = useCallback((dn: number) => {
    setVisibleDrivers((prev) => {
      const next = new Set(prev)
      if (next.has(dn)) next.delete(dn)
      else next.add(dn)
      return next
    })
    setRedrawSignal((s) => s + 1)
  }, [])

  const toggleAllDrivers = useCallback(
    (on: boolean) => {
      setVisibleDrivers(on ? new Set(withPositions) : new Set())
      setRedrawSignal((s) => s + 1)
    },
    [withPositions],
  )

  const handleFocus = useCallback((dn: number | null) => {
    setFocusedDriver(dn)
  }, [])

  const handleLapRange = useCallback(
    (from: number, to: number) => {
      setLapFrom(from)
      setLapTo(to)
      if (!race.bounds || race.tracks.size === 0) return
      const anchor = race.tracks.values().next().value
      if (!anchor) return
      const fromT = timeAtLapStart(anchor, from) ?? race.bounds.t0Ms
      const toT = timeAtLapStart(anchor, to + 1) ?? race.bounds.tEndMs
      if (currentTimeRef.current < fromT || currentTimeRef.current > toT) {
        handleSeek(fromT)
      }
    },
    [race.bounds, race.tracks, handleSeek],
  )

  // ── States ────────────────────────────────────────────────────────────────
  if (race.loading) {
    return (
      <div className="flex h-[460px] items-center justify-center gap-2 rounded-xl border border-border bg-surface text-muted">
        <SpinnerIcon size={16} className="animate-spin" />
        <span className="font-mono text-xs">Loading positions…</span>
      </div>
    )
  }

  if (race.error) {
    return (
      <div className="flex h-[460px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface text-muted">
        <AlertIcon size={20} className="text-accent" />
        <span className="max-w-md text-center font-mono text-xs">{race.error}</span>
      </div>
    )
  }

  if (race.tracks.size === 0) {
    return (
      <div className="flex h-[460px] items-center justify-center rounded-xl border border-dashed border-border bg-surface">
        <span className="font-mono text-xs text-muted">No replay data for this session yet.</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="relative min-w-0 flex-1">
          <TrackViewport
            circuit={race.circuit}
            drivers={race.session?.drivers ?? []}
            tracks={race.tracks}
            visibleDrivers={visibleDrivers}
            focusedDriver={focusedDriver}
            focusedLaps={focusedLaps}
            sectorBests={race.sectorBests}
            currentLap={currentLap}
            aggregates={race.aggregates}
            currentTimeRef={currentTimeRef}
            redrawSignal={redrawSignal}
          />
          {focusedDriverObj && (
            <FocusedDriverCard
              driver={focusedDriverObj}
              currentLap={currentLap}
              aggregates={race.aggregates}
              livePosition={liveStandings.get(focusedDriverObj.driverNumber) ?? null}
              onClose={() => setFocusedDriver(null)}
            />
          )}
        </div>

        {race.session && (
          <div className="w-full shrink-0 lg:w-[300px]">
            <DriverToggleList
              drivers={race.session.drivers}
              withPositions={withPositions}
              visible={visibleDrivers}
              focusedDriver={focusedDriver}
              liveStandings={liveStandings}
              sortMode={sortMode}
              onSortModeChange={handleSortModeChange}
              onToggle={toggleDriver}
              onToggleAll={toggleAllDrivers}
              onFocus={handleFocus}
            />
          </div>
        )}
      </div>

      {race.bounds && (
        <PlaybackControls
          playing={playing}
          speed={speed}
          currentTimeMs={currentTimeMs}
          t0Ms={race.bounds.t0Ms}
          tEndMs={race.bounds.tEndMs}
          currentLap={currentLap}
          totalLaps={race.totalLaps}
          lapFrom={lapFrom}
          lapTo={lapTo}
          onPlayPause={() => setPlaying((p) => !p)}
          onSeek={handleSeek}
          onSpeedChange={setSpeed}
          onLapRange={handleLapRange}
          onSkipToStart={handleSkipToStart}
          onSkipToEnd={handleSkipToEnd}
        />
      )}
    </div>
  )
}
