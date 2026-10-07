'use client'

import { useEffect, useMemo } from 'react'
import { Pause, Play } from '@phosphor-icons/react'
import { LazyTrackScene, ReplayStatus } from '@/components/replay3d/LazyTrackScene'
import {
  findFrameIndex,
  timeAtLapStart,
  useReplayData,
  type CarPositionTrack,
} from '@vismay/f1-viz/web/replay'
import type { RecapChapter } from '@vismay/f1-viz/recap'
import { replaySource } from '@/lib/replay/replaySource'
import { useRaceClock } from '@/lib/replay/useRaceClock'

const NO_LAPS: never[] = []

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
  const source = useMemo(replaySource, [])
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
  if (!sessionRef || race.loading) body = <ReplayStatus>Loading race…</ReplayStatus>
  else if (race.error) body = <ReplayStatus>{race.error}</ReplayStatus>
  else if (race.tracks.size === 0) body = <ReplayStatus>No replay data for this race yet.</ReplayStatus>
  else
    body = (
      <LazyTrackScene
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
