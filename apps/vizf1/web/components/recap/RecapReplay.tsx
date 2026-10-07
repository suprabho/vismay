'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { CircleNotch, Pause, Play } from '@phosphor-icons/react'
import {
  createFixtureDataSource,
  findFrameIndex,
  timeAtLapStart,
  useReplayData,
  type CarPositionTrack,
} from '@vismay/f1-viz/web/replay'
import type { RecapChapter } from '@/lib/recap/types'

// three.js only loads with the replay, never on the server. Cars use the
// default livery-free model, painted in team colours.
const TrackScene3D = dynamic(
  () =>
    import('@vismay/f1-viz/web/three').then(({ TrackScene3D: Scene, DEFAULT_CAR_MODEL_URL }) => {
      const WithCars = (props: React.ComponentProps<typeof Scene>) => <Scene carModelUrl={DEFAULT_CAR_MODEL_URL} {...props} />
      return WithCars
    }),
  { ssr: false, loading: () => <Status>Loading 3D view…</Status> },
)

const NO_LAPS: never[] = []
/** The UI readouts (scrubber, lap) follow the race clock at this rate. */
const UI_TICK_MS = 100

interface RecapReplayProps {
  /** Session to replay (a session_key, else the round); null while it resolves. */
  sessionRef: string | null
  /** The session the chapters were built from; null for the sample story. */
  recapSessionKey: string | null
  chapters: RecapChapter[]
  /** The story's race length; chapter laps scale to a replay of another length. */
  storyLaps: number
  beat: number
  onPickBeat: (i: number) => void
}

/**
 * The recap's replay: the 3D telemetry view (broadcast cameras, true-scale
 * cars) playing the race's position data. Each chapter seeks the race to its
 * moment (the exact second of a pass, else the start of its lap), opens on its
 * camera and follows its driver; the reader can still switch camera, orbit,
 * pause and scrub. Sessions with no ingested positions play the demo fixture.
 */
export function RecapReplay({ sessionRef, recapSessionKey, chapters, storyLaps, beat, onPickBeat }: RecapReplayProps) {
  const source = useMemo(
    () =>
      createFixtureDataSource(
        process.env.NEXT_PUBLIC_VIZF1_REPLAY_SOURCE === 'supabase'
          ? { resolveUrl: (ref) => `/api/replay/${encodeURIComponent(ref)}`, fallbackRef: 'demo' }
          : { fallbackRef: 'demo' },
      ),
    [],
  )
  const race = useReplayData(source, sessionRef)
  const drivers = useMemo(() => race.session?.drivers ?? [], [race.session])
  const visibleDrivers = useMemo(() => new Set(race.tracks.keys()), [race.tracks])

  const cue = (chapters[beat] ?? chapters[0]).replay
  const focusedDriver = useMemo(
    () => (cue.focus ? (drivers.find((d) => d.abbreviation === cue.focus)?.driverNumber ?? null) : null),
    [cue, drivers],
  )

  // The car whose laps define "lap N" on the timeline.
  const anchor = useMemo<CarPositionTrack | null>(() => race.tracks.values().next().value ?? null, [race.tracks])

  // Where each chapter starts on the race clock. On the recap's own race: its
  // exact moment, else its lap. On another race (the sample story over the
  // demo): its lap, scaled to that race's length.
  const sameRace = !!recapSessionKey && race.session?.sessionKey === recapSessionKey
  const chapterStarts = useMemo(() => {
    const bounds = race.bounds
    if (!bounds || !anchor) return null
    const laps = Math.max(1, race.totalLaps)
    return chapters.map(({ replay: c }) => {
      if (sameRace && c.atMs != null) return Math.min(bounds.tEndMs, Math.max(bounds.t0Ms, c.atMs))
      const lap = sameRace
        ? Math.min(laps, c.lap)
        : c.lap <= 1
          ? 1
          : c.lap >= storyLaps
            ? laps
            : Math.min(laps, Math.max(1, Math.round((c.lap / storyLaps) * laps)))
      return lap <= 1 ? bounds.t0Ms : (timeAtLapStart(anchor, lap) ?? bounds.t0Ms)
    })
  }, [race.bounds, race.totalLaps, anchor, chapters, sameRace, storyLaps])

  const clock = useRaceClock(race.bounds)

  // Opening a chapter seeks the race to it and rolls.
  const { seek, play } = clock
  useEffect(() => {
    if (!chapterStarts) return
    seek(chapterStarts[beat])
    play()
  }, [beat, chapterStarts, seek, play])

  const currentLap = useMemo(() => {
    if (!anchor) return 0
    const i = findFrameIndex(anchor.frames.t, clock.timeMs)
    return i >= 0 ? anchor.frames.lap[i] : 1
  }, [anchor, clock.timeMs])

  const span = race.bounds ? race.bounds.tEndMs - race.bounds.t0Ms : 0
  const pct = (t: number) => (race.bounds && span > 0 ? ((t - race.bounds.t0Ms) / span) * 100 : 0)

  const onScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!race.bounds) return
    const r = e.currentTarget.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    seek(race.bounds.t0Ms + f * span)
  }

  let body: React.ReactNode
  if (!sessionRef || race.loading) body = <Status>Loading race…</Status>
  else if (race.error) body = <Status>{race.error}</Status>
  else if (race.tracks.size === 0) body = <Status>No replay data for this race yet.</Status>
  else
    body = (
      <TrackScene3D
        circuit={race.circuit}
        drivers={drivers}
        tracks={race.tracks}
        visibleDrivers={visibleDrivers}
        focusedDriver={focusedDriver}
        focusedLaps={NO_LAPS}
        sectorBests={race.sectorBests}
        currentLap={currentLap}
        currentTimeRef={clock.timeRef}
        cameraMode={cue.cam}
        interactive
      />
    )

  const ready = !!race.bounds && race.tracks.size > 0

  return (
    <div
      aria-label="3D race replay"
      className="flex h-[420px] flex-none flex-col overflow-hidden border-b border-border bg-[#101216] lg:h-full lg:flex-[0_0_58%] lg:border-b-0 lg:border-r"
    >
      <div className="relative min-h-0 flex-1">{body}</div>

      {/* race clock: play / pause, scrubber with the chapters on it, lap */}
      <div className="flex h-14 flex-none items-center gap-3 border-t border-border bg-bg px-3 lg:h-16 lg:px-5">
        <button
          type="button"
          onClick={clock.toggle}
          disabled={!ready}
          aria-label={clock.playing ? 'Pause replay' : 'Play replay'}
          className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full bg-text text-bg disabled:cursor-default disabled:opacity-40"
        >
          {clock.playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
        </button>
        <div className="relative h-7 flex-1">
          <div
            role="slider"
            aria-label="Race time"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct(clock.timeMs))}
            tabIndex={-1}
            onPointerDown={onScrub}
            className="absolute inset-x-0 top-0 h-7 cursor-pointer"
          >
            <div className="absolute inset-x-0 top-3 h-1 rounded-sm bg-[#262b38]" />
            <div className="absolute left-0 top-3 h-1 rounded-sm bg-accent" style={{ width: `${pct(clock.timeMs)}%` }} />
          </div>
          {chapterStarts?.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => (i === beat ? (seek(t), play()) : onPickBeat(i))}
              aria-label={`Jump to chapter ${i + 1}: ${chapters[i]?.label}`}
              className="absolute top-0 -ml-3.5 flex size-7 cursor-pointer items-center justify-center"
              style={{ left: `${pct(t)}%` }}
            >
              <span
                className="block size-3 rounded-full border-2 border-bg box-content"
                style={{ background: i <= beat ? 'var(--color-accent)' : '#4a5163' }}
              />
            </button>
          ))}
        </div>
        <span className="flex-none font-mono text-[11px] font-semibold tabular-nums lg:text-[13px]">
          LAP {currentLap || '–'}
          <span className="text-muted">/{race.totalLaps || '–'}</span>
        </span>
      </div>
    </div>
  )
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 font-mono text-xs text-muted">
      <CircleNotch size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />
      {children}
    </div>
  )
}

/**
 * The race clock the 3D view reads every frame (`timeRef`, ms of session time),
 * with a ~10 Hz copy in state for the scrubber and lap readout. Stops at the
 * end of the race.
 */
function useRaceClock(bounds: { t0Ms: number; tEndMs: number } | null) {
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
  const toggle = useCallback(() => {
    const b = boundsRef.current
    // Play from the end of the race starts it over.
    if (!playing && b && timeRef.current >= b.tEndMs) seek(b.t0Ms)
    setPlaying(!playing)
  }, [playing, seek])

  return { timeRef, timeMs, playing, seek, play, toggle }
}
