import { useMemo } from 'react'
import type { AggregatesByDriverLap, CarPositionTrack, CircuitGeometry, RaceDriver } from '@/lib/replay/types'
import { gapToCarAhead, speedAt, speedHistory } from '@/lib/replay/liveTelemetry'
import type { ChannelSample } from '@/lib/replay/useLapChannels'

interface Props {
  driver: RaceDriver
  drivers: RaceDriver[]
  currentLap: number
  aggregates: AggregatesByDriverLap
  tracks: Map<number, CarPositionTrack>
  circuit: CircuitGeometry | null
  /** Playhead (ms from session t0) the readout is computed for. */
  timeMs: number
  /** Live ordinal race positions at `timeMs`. */
  standings: Map<number, number>
  /** Real car channels at a time, when the session has them (null → derive from positions). */
  sampleChannels?: (tMs: number) => ChannelSample | null
  /** Positioning classes; the card anchors to the viewport's bottom-right by default. */
  className?: string
  onClose?: () => void
}

/** Tiny pure-SVG sparkline (ported from the donor's race/Sparkline). */
function Sparkline({ data, color, width = 90, height = 30 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return <svg width={width} height={height} aria-hidden />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = width / (data.length - 1)
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** OpenF1 DRS codes 10/12/14 mean the flap is open; FastF1 uses the same scale. */
const isDrsOpen = (drs: number | null) => drs != null && drs >= 10

export function FocusedDriverCard({
  driver,
  drivers,
  currentLap,
  aggregates,
  tracks,
  circuit,
  timeMs,
  standings,
  sampleChannels,
  className = 'bottom-4 right-4',
  onClose,
}: Props) {
  const track = tracks.get(driver.driverNumber)
  const lapAvg = aggregates.get(driver.driverNumber)?.get(currentLap)?.avgSpeed

  const channels = sampleChannels?.(timeMs) ?? null
  const derivedSpeed = track ? speedAt(track, timeMs) : null
  const speed = channels?.speed ?? derivedSpeed
  const trend = useMemo(() => (track ? speedHistory(track, timeMs) : []), [track, timeMs])

  const gap = useMemo(
    () => gapToCarAhead(tracks, circuit, driver.driverNumber, standings, timeMs),
    [tracks, circuit, driver.driverNumber, standings, timeMs],
  )

  const colour = driver.teamColour || '#444'
  const livePosition = standings.get(driver.driverNumber)
  const posLabel = livePosition != null && Number.isFinite(livePosition) ? `P${livePosition}` : '—'

  let gapValue = '—'
  let gapDetail: string | null = null
  if (gap.kind === 'leader') {
    gapValue = 'Leader'
  } else if (gap.kind === 'gap') {
    const ahead = drivers.find((d) => d.driverNumber === gap.aheadDriver)
    gapValue = gap.seconds != null ? `+${gap.seconds.toFixed(1)}s` : gap.metres != null ? `${Math.round(gap.metres)} m` : '—'
    gapDetail = [
      `to ${ahead?.abbreviation || `#${gap.aheadDriver}`}`,
      gap.seconds != null && gap.metres != null ? `${Math.round(gap.metres)} m` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const hasPedals = channels != null && (channels.throttle != null || channels.brake != null)

  return (
    <div
      className={`absolute z-20 w-[268px] rounded-xl border border-border bg-surface/95 shadow-lg backdrop-blur-sm ${className}`}
    >
      <div
        className="flex items-center gap-3 border-b border-border px-4 py-2.5"
        style={{ borderLeftWidth: 3, borderLeftColor: colour }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center font-mono tabular-nums font-bold text-white"
          style={{ backgroundColor: colour }}
        >
          {driver.driverNumber}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate wdth-dense text-xs font-semibold text-text">
            {driver.fullName || driver.abbreviation}
          </div>
          <div className="flex wdth-kicker text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            <span className="truncate">{driver.teamName || '—'}</span>
            <span className="shrink-0 whitespace-pre"> · Lap {currentLap}</span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="font-mono tabular-nums text-[10px] uppercase tracking-widest text-muted transition-colors hover:text-accent"
          >
            Unfocus
          </button>
        )}
      </div>

      {speed == null ? (
        <div className="px-4 py-6 text-center font-mono tabular-nums text-[10px] text-muted">
          No live telemetry at this point.
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <span className="flex items-center gap-1.5 wdth-kicker text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
                Speed
              </span>
              <span className="font-mono tabular-nums text-xl font-bold leading-tight text-text">
                {Math.round(speed)}
                <span className="ml-1 font-mono tabular-nums text-[10px] font-normal text-muted">km/h</span>
              </span>
              {lapAvg != null && (
                <span className="font-mono tabular-nums text-[10px] text-muted">lap avg {Math.round(lapAvg)}</span>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {channels && (channels.gear != null || channels.drs != null) && (
                <div className="flex items-center gap-1.5">
                  {isDrsOpen(channels.drs) && (
                    <span className="rounded-sm bg-emerald-500/20 px-1 font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                      DRS
                    </span>
                  )}
                  {channels.gear != null && (
                    <span className="font-mono tabular-nums text-[10px] text-muted">
                      G<span className="ml-0.5 text-sm font-bold text-text">{channels.gear || 'N'}</span>
                    </span>
                  )}
                </div>
              )}
              <Sparkline data={trend} color={colour} width={90} height={28} />
            </div>
          </div>

          {hasPedals && (
            <div className="space-y-1.5">
              <PedalBar label="Thr" value={channels.throttle ?? 0} className="bg-emerald-500" />
              <PedalBar label="Brk" value={channels.brake ? 100 : 0} className="bg-red-500" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-2">
            <Metric label="Live Pos" value={posLabel} />
            <Metric label="Gap ahead" value={gapValue} detail={gapDetail} />
          </div>
        </div>
      )}
    </div>
  )
}

function PedalBar({ label, value, className }: { label: string; value: number; className: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 font-mono text-[9px] uppercase tracking-widest text-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full transition-[width] duration-100 ${className}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 text-right font-mono tabular-nums text-[9px] text-muted">{Math.round(pct)}</span>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail?: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="wdth-kicker text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="font-mono tabular-nums text-sm font-bold text-text">{value}</span>
      {detail && <span className="font-mono tabular-nums text-[10px] text-muted">{detail}</span>}
    </div>
  )
}
