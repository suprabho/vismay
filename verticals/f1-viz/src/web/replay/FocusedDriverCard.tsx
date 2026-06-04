import { useMemo } from 'react'
import type { AggregatesByDriverLap, RaceDriver } from './types'

interface Props {
  driver: RaceDriver
  currentLap: number
  aggregates: AggregatesByDriverLap
  /** Live ordinal race position at the current time, if known. */
  livePosition?: number | null
  onClose?: () => void
}

const SPARK_WINDOW = 6

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

export function FocusedDriverCard({ driver, currentLap, aggregates, livePosition, onClose }: Props) {
  const perLap = aggregates.get(driver.driverNumber)
  const current = perLap?.get(currentLap)

  // Speed trend: last SPARK_WINDOW laps up to currentLap
  const trend = useMemo(() => {
    if (!perLap) return [] as number[]
    const out: number[] = []
    for (let l = Math.max(1, currentLap - SPARK_WINDOW + 1); l <= currentLap; l++) {
      const a = perLap.get(l)
      if (a) out.push(a.avgSpeed)
    }
    return out
  }, [perLap, currentLap])

  const colour = driver.teamColour || '#444'
  const posLabel = livePosition != null && Number.isFinite(livePosition) ? `P${livePosition}` : '—'
  const gap =
    current && Number.isFinite(current.minGapToAheadM) ? `${Math.round(current.minGapToAheadM)} m` : '—'

  return (
    <div className="absolute bottom-4 left-4 z-20 w-[300px] rounded-xl border border-border bg-surface/95 shadow-lg backdrop-blur-sm">
      <div
        className="flex items-center gap-3 border-b border-border px-4 py-2.5"
        style={{ borderLeftWidth: 3, borderLeftColor: colour }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center font-mono font-bold text-white"
          style={{ backgroundColor: colour }}
        >
          {driver.driverNumber}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs font-bold text-text">
            {driver.fullName || driver.abbreviation}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted">
            {driver.teamName || '—'} · Lap {currentLap}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-widest text-muted transition-colors hover:text-accent"
          >
            Unfocus
          </button>
        )}
      </div>

      {!current ? (
        <div className="px-4 py-6 text-center font-mono text-[10px] text-muted">
          No telemetry for lap {currentLap}.
        </div>
      ) : (
        <div className="space-y-3 p-4">
          {/* Speed row with sparkline */}
          <div className="flex items-end justify-between">
            <div className="flex flex-col">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted">Avg Speed</span>
              <span className="font-mono text-2xl font-bold text-text">
                {Math.round(current.avgSpeed)}
                <span className="ml-1 font-mono text-[10px] text-muted">km/h</span>
              </span>
            </div>
            <Sparkline data={trend} color={colour} width={90} height={30} />
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-2">
            <Metric label="Live Pos" value={posLabel} />
            <Metric label="Gap ahead" value={gap} />
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted">{label}</span>
      <span className="font-mono text-base font-bold text-text">{value}</span>
    </div>
  )
}
