'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from '@phosphor-icons/react'
import { findFrameIndex, isCameraMode, timeAtLapStart, useReplayData, type CameraMode } from '@vismay/f1-viz/web/replay'
import { LazyTrackScene, ReplayStatus } from '@/components/replay3d/LazyTrackScene'
import { replaySource } from '@/lib/replay/replaySource'
import { useRaceClock } from '@/lib/replay/useRaceClock'

/**
 * Where the replay should be: a lap (its start) or an exact session time, the
 * camera, the car to follow, and whether to roll.
 */
export interface ReplayCue {
  lap?: number
  /** Session time, seconds (the clock car positions and lap telemetry share). */
  at?: number
  cam?: CameraMode
  /** Three-letter code of the car to follow. */
  focus?: string | null
  /** Roll from the cue (default) or hold there. */
  play?: boolean
  /** The story's race length, so a lap scales onto the demo race when the session isn't there. */
  laps?: number
}

const NO_LAPS: never[] = []
const STATE_EVERY_MS = 250

/**
 * The 3D replay on its own, for a page that drives it from outside: the recap
 * story format (formats/recap.js) frames it and sends a cue each time the
 * reader reaches a new moment.
 *
 * Messages in (from the parent window only):
 *   { type: 'vizf1:replay-cue', lap?, at?, cam?, focus?, play?, laps? }
 *   { type: 'vizf1:replay-play', playing }
 * Messages out (to the parent):
 *   { type: 'vizf1:replay-ready', session, totalLaps, demo }
 *   { type: 'vizf1:replay-state', lap, totalLaps, timeMs, playing }  (≤ 4 a second)
 *
 * The parent is a sandboxed story page (an opaque origin), so there is no
 * origin to check; a cue only moves the camera and the clock.
 */
export default function ReplayEmbed({ session, initial }: { session: string; initial: ReplayCue }) {
  const source = useMemo(replaySource, [])
  const race = useReplayData(source, session)
  const clock = useRaceClock(race.bounds)
  const [cue, setCue] = useState<ReplayCue & { n: number }>({ ...initial, n: 0 })
  const drivers = useMemo(() => race.session?.drivers ?? [], [race.session])
  const visible = useMemo(() => new Set(race.tracks.keys()), [race.tracks])
  const anchor = useMemo(() => race.tracks.values().next().value ?? null, [race.tracks])
  const focused = useMemo(
    () => (cue.focus ? (drivers.find((d) => d.abbreviation === cue.focus)?.driverNumber ?? null) : null),
    [cue.focus, drivers],
  )
  const demo = !!race.session && race.session.sessionKey !== session

  // Cues from the parent.
  const { seek, play, pause } = clock
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return
      const d = e.data as { type?: string } & ReplayCue & { playing?: boolean }
      if (d?.type === 'vizf1:replay-cue') {
        setCue((c) => ({
          lap: typeof d.lap === 'number' ? d.lap : undefined,
          at: typeof d.at === 'number' ? d.at : undefined,
          cam: isCameraMode(d.cam) ? d.cam : c.cam,
          focus: typeof d.focus === 'string' ? d.focus : d.focus === null ? null : c.focus,
          play: d.play,
          laps: typeof d.laps === 'number' ? d.laps : c.laps,
          n: c.n + 1,
        }))
      } else if (d?.type === 'vizf1:replay-play') {
        if (d.playing) play()
        else pause()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [play, pause])

  // Apply a cue once the race is in: an exact time on this race, else the lap
  // (on the demo race, scaled from the story's race length).
  useEffect(() => {
    const b = race.bounds
    if (!b || !anchor) return
    let t: number | null = null
    if (cue.at != null && !demo) t = cue.at * 1000
    else if (cue.lap != null) {
      const laps = Math.max(1, race.totalLaps)
      const lap =
        demo && cue.laps && cue.laps > 1
          ? Math.max(1, Math.round(((cue.lap - 1) / (cue.laps - 1)) * (laps - 1)) + 1)
          : Math.min(laps, Math.max(1, cue.lap))
      t = lap <= 1 ? b.t0Ms : timeAtLapStart(anchor, lap)
    }
    if (t != null) seek(t)
    if (cue.play === false) pause()
    else play()
  }, [cue, race.bounds, race.totalLaps, anchor, demo, seek, play, pause])

  const lap = useMemo(() => {
    if (!anchor) return 0
    const i = findFrameIndex(anchor.frames.t, clock.timeMs)
    return i >= 0 ? anchor.frames.lap[i] : 1
  }, [anchor, clock.timeMs])

  // Tell the parent.
  const post = (msg: Record<string, unknown>) => {
    try {
      if (window.parent !== window) window.parent.postMessage(msg, '*')
    } catch {
      // detached
    }
  }
  const ready = !!race.bounds && race.tracks.size > 0
  useEffect(() => {
    if (ready) post({ type: 'vizf1:replay-ready', session: race.session?.sessionKey ?? session, totalLaps: race.totalLaps, demo })
  }, [ready, race.session, race.totalLaps, session, demo])
  const lastPost = useRef(0)
  useEffect(() => {
    const now = Date.now()
    if (!ready || now - lastPost.current < STATE_EVERY_MS) return
    lastPost.current = now
    post({ type: 'vizf1:replay-state', lap, totalLaps: race.totalLaps, timeMs: clock.timeMs, playing: clock.playing })
  }, [ready, lap, race.totalLaps, clock.timeMs, clock.playing])

  const span = race.bounds ? race.bounds.tEndMs - race.bounds.t0Ms : 0
  const pct = race.bounds && span > 0 ? ((clock.timeMs - race.bounds.t0Ms) / span) * 100 : 0
  const onScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!race.bounds) return
    const r = e.currentTarget.getBoundingClientRect()
    seek(race.bounds.t0Ms + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * span)
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[#101216] text-text">
      <div className="relative min-h-0 flex-1">
        {race.loading || !race.session ? (
          race.error ? <ReplayStatus>{race.error}</ReplayStatus> : <ReplayStatus>Loading race…</ReplayStatus>
        ) : race.tracks.size === 0 ? (
          <ReplayStatus>No replay data for this race yet.</ReplayStatus>
        ) : (
          <LazyTrackScene
            circuit={race.circuit}
            drivers={drivers}
            tracks={race.tracks}
            visibleDrivers={visible}
            focusedDriver={focused}
            focusedLaps={NO_LAPS}
            sectorBests={race.sectorBests}
            currentLap={lap}
            currentTimeRef={clock.timeRef}
            cameraMode={cue.cam ?? 'auto'}
            interactive
          />
        )}
      </div>
      <div className="flex h-12 flex-none items-center gap-3 border-t border-border bg-bg px-3">
        <button
          type="button"
          onClick={clock.toggle}
          disabled={!ready}
          aria-label={clock.playing ? 'Pause replay' : 'Play replay'}
          className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-full bg-text text-bg disabled:cursor-default disabled:opacity-40"
        >
          {clock.playing ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}
        </button>
        <div
          role="slider"
          aria-label="Race time"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          tabIndex={-1}
          onPointerDown={onScrub}
          className="relative h-7 flex-1 cursor-pointer"
        >
          <div className="absolute inset-x-0 top-3 h-1 rounded-sm bg-[#262b38]" />
          <div className="absolute left-0 top-3 h-1 rounded-sm bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <span className="flex-none font-mono text-[11px] font-semibold tabular-nums">
          LAP {lap || '–'}
          <span className="text-muted">/{race.totalLaps || '–'}</span>
          {demo ? <span className="ml-2 text-muted">· DEMO</span> : null}
        </span>
      </div>
    </div>
  )
}
