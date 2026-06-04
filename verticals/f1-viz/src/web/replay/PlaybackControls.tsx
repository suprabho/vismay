import { formatRaceTime } from './trackProjection'
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from './icons'

export type PlaybackSpeed = 0.5 | 1 | 2 | 4

interface Props {
  playing: boolean
  speed: PlaybackSpeed
  currentTimeMs: number
  t0Ms: number
  tEndMs: number
  currentLap: number
  totalLaps: number
  lapFrom: number
  lapTo: number
  onPlayPause: () => void
  onSeek: (timeMs: number) => void
  onSpeedChange: (s: PlaybackSpeed) => void
  onLapRange: (from: number, to: number) => void
  onSkipToStart: () => void
  onSkipToEnd: () => void
}

const SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4]

export function PlaybackControls({
  playing,
  speed,
  currentTimeMs,
  t0Ms,
  tEndMs,
  currentLap,
  totalLaps,
  lapFrom,
  lapTo,
  onPlayPause,
  onSeek,
  onSpeedChange,
  onLapRange,
  onSkipToStart,
  onSkipToEnd,
}: Props) {
  const elapsedMs = Math.max(0, currentTimeMs - t0Ms)
  const totalMs = Math.max(1, tEndMs - t0Ms)
  const pct = Math.min(100, (elapsedMs / totalMs) * 100)

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-surface px-5 py-3">
      {/* Top row: controls + readouts */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          <button
            onClick={onSkipToStart}
            className="p-1.5 text-muted transition-colors hover:text-accent"
            title="Skip to start of lap window"
          >
            <SkipBackIcon size={14} />
          </button>
          <button
            onClick={onPlayPause}
            className="flex items-center gap-1.5 bg-accent px-3 py-1.5 text-accent-text transition-colors hover:opacity-90"
          >
            {playing ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
            <span className="font-mono text-[10px] uppercase tracking-widest">{playing ? 'Pause' : 'Play'}</span>
          </button>
          <button
            onClick={onSkipToEnd}
            className="p-1.5 text-muted transition-colors hover:text-accent"
            title="Skip to end of lap window"
          >
            <SkipForwardIcon size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 border border-border">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                speed === s ? 'bg-accent text-accent-text' : 'text-muted hover:text-text'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4 font-mono text-[11px] text-muted">
          <span>
            Lap <span className="font-bold text-text">{currentLap}</span> / {totalLaps}
          </span>
          <span>
            t = <span className="text-text">{formatRaceTime(elapsedMs)}</span>
          </span>
        </div>
      </div>

      {/* Scrubber */}
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-3 h-1 bg-border" />
        <div className="absolute top-3 h-1 bg-accent" style={{ left: 0, width: `${pct}%` }} />
        <input
          type="range"
          min={t0Ms}
          max={tEndMs}
          step={50}
          value={currentTimeMs}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="absolute inset-x-0 top-1 h-5 w-full cursor-pointer opacity-0"
        />
        <div className="absolute top-1 h-5 w-3 bg-accent shadow" style={{ left: `calc(${pct}% - 6px)` }} />
      </div>

      {/* Lap range */}
      <div className="flex items-center gap-3 font-mono text-[10px] text-muted">
        <span className="uppercase tracking-widest">Lap range</span>
        <input
          type="number"
          min={1}
          max={totalLaps}
          value={lapFrom}
          onChange={(e) => {
            const v = Math.max(1, Math.min(totalLaps, Number(e.target.value) || 1))
            onLapRange(v, Math.max(v, lapTo))
          }}
          className="w-14 border border-border bg-bg px-1.5 py-0.5 text-text focus:border-accent focus:outline-none"
        />
        <span>⇨</span>
        <input
          type="number"
          min={1}
          max={totalLaps}
          value={lapTo}
          onChange={(e) => {
            const v = Math.max(1, Math.min(totalLaps, Number(e.target.value) || totalLaps))
            onLapRange(Math.min(lapFrom, v), v)
          }}
          className="w-14 border border-border bg-bg px-1.5 py-0.5 text-text focus:border-accent focus:outline-none"
        />
        <span className="text-muted">/ {totalLaps} total</span>
      </div>
    </div>
  )
}
