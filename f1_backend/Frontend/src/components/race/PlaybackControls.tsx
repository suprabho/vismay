import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { formatRaceTime } from '../../utils/trackProjection';

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

interface Props {
  playing:        boolean;
  speed:          PlaybackSpeed;
  currentTimeMs:  number;
  t0Ms:           number;
  tEndMs:         number;
  currentLap:     number;
  totalLaps:      number;
  lapFrom:        number;
  lapTo:          number;
  onPlayPause:    () => void;
  onSeek:         (timeMs: number) => void;
  onSpeedChange:  (s: PlaybackSpeed) => void;
  onLapRange:     (from: number, to: number) => void;
  onSkipToStart:  () => void;
  onSkipToEnd:    () => void;
}

const SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4];

export function PlaybackControls({
  playing, speed, currentTimeMs, t0Ms, tEndMs, currentLap, totalLaps,
  lapFrom, lapTo, onPlayPause, onSeek, onSpeedChange, onLapRange,
  onSkipToStart, onSkipToEnd,
}: Props) {
  const elapsedMs = Math.max(0, currentTimeMs - t0Ms);
  const totalMs   = Math.max(1, tEndMs - t0Ms);
  const pct       = Math.min(100, (elapsedMs / totalMs) * 100);

  return (
    <div className="border-t border-neutral-200 bg-white px-5 py-3 space-y-2.5">
      {/* Top row: controls + readouts */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={onSkipToStart}
            className="p-1.5 text-neutral-500 hover:text-f1-red transition-colors"
            title="Skip to start of lap window"
          >
            <SkipBack size={14} />
          </button>
          <button
            onClick={onPlayPause}
            className="px-3 py-1.5 bg-neutral-900 text-white hover:bg-f1-red transition-colors flex items-center gap-1.5"
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
            <span className="font-mono text-[10px] uppercase tracking-widest">{playing ? 'Pause' : 'Play'}</span>
          </button>
          <button
            onClick={onSkipToEnd}
            className="p-1.5 text-neutral-500 hover:text-f1-red transition-colors"
            title="Skip to end of lap window"
          >
            <SkipForward size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 border border-neutral-200">
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                speed === s ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 ml-auto font-mono text-[11px] text-neutral-500">
          <span>
            Lap <span className="text-neutral-900 font-bold">{currentLap}</span> / {totalLaps}
          </span>
          <span>
            t = <span className="text-neutral-900">{formatRaceTime(elapsedMs)}</span>
          </span>
        </div>
      </div>

      {/* Scrubber */}
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-3 h-1 bg-neutral-100" />
        <div
          className="absolute top-3 h-1 bg-f1-red"
          style={{ left: 0, width: `${pct}%` }}
        />
        <input
          type="range"
          min={t0Ms}
          max={tEndMs}
          step={50}
          value={currentTimeMs}
          onChange={e => onSeek(Number(e.target.value))}
          className="absolute inset-x-0 top-1 w-full h-5 opacity-0 cursor-pointer"
        />
        <div
          className="absolute top-1 w-3 h-5 bg-f1-red shadow"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>

      {/* Lap range */}
      <div className="flex items-center gap-3 font-mono text-[10px] text-neutral-500">
        <span className="uppercase tracking-widest">Lap range</span>
        <input
          type="number"
          min={1}
          max={totalLaps}
          value={lapFrom}
          onChange={e => {
            const v = Math.max(1, Math.min(totalLaps, Number(e.target.value) || 1));
            onLapRange(v, Math.max(v, lapTo));
          }}
          className="w-14 border border-neutral-200 px-1.5 py-0.5 text-neutral-900 focus:outline-none focus:border-f1-red"
        />
        <span>⇨</span>
        <input
          type="number"
          min={1}
          max={totalLaps}
          value={lapTo}
          onChange={e => {
            const v = Math.max(1, Math.min(totalLaps, Number(e.target.value) || totalLaps));
            onLapRange(Math.min(lapFrom, v), v);
          }}
          className="w-14 border border-neutral-200 px-1.5 py-0.5 text-neutral-900 focus:outline-none focus:border-f1-red"
        />
        <span className="text-neutral-400">/ {totalLaps} total</span>
      </div>
    </div>
  );
}
