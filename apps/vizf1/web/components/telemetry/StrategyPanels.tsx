'use client'

import { CloudRain, Drop, Thermometer, Wind } from '@phosphor-icons/react'
import { RACE_EVENT_STYLE, formatPitTime, type RaceEvents } from '@vismay/f1-viz/web'
import type { TelemetryDriver } from '@/lib/useTelemetrySession'
import type { LapWeather, Stint } from '@/lib/useSessionStrategy'

export const COMPOUND_STYLE: Record<string, { color: string; letter: string }> = {
  SOFT: { color: '#ef4444', letter: 'S' },
  MEDIUM: { color: '#facc15', letter: 'M' },
  HARD: { color: '#e5e7eb', letter: 'H' },
  INTERMEDIATE: { color: '#22c55e', letter: 'I' },
  WET: { color: '#3b82f6', letter: 'W' },
}
const UNKNOWN_COMPOUND = { color: '#6b7280', letter: '?' }
export const compoundStyle = (c: string | null | undefined) => COMPOUND_STYLE[(c ?? '').toUpperCase()] ?? UNKNOWN_COMPOUND

/**
 * Tyre strategy for the whole field (finishing order): a bar per driver split
 * into stints by compound, pit entries ticked, neutralised laps shaded behind.
 * Rows toggle the driver in the page selection.
 */
export function TyreStrategy({
  drivers,
  order,
  stints,
  events,
  selected,
  onToggle,
}: {
  drivers: TelemetryDriver[]
  order: number[]
  stints: Stint[]
  events: RaceEvents | null
  selected: number[]
  onToggle: (n: number) => void
}) {
  const maxLap = stints.reduce((m, s) => Math.max(m, s.endLap), 0)
  if (!maxLap) return null
  const byDriver = new Map<number, Stint[]>()
  for (const s of stints) byDriver.set(s.driverNumber, [...(byDriver.get(s.driverNumber) ?? []), s])
  const rows = [...order, ...drivers.map((d) => d.number).filter((n) => !order.includes(n))]
    .filter((n) => byDriver.has(n))
    .map((n) => ({ driver: drivers.find((d) => d.number === n), n, stints: byDriver.get(n)! }))
  const pct = (lap: number) => `${(lap / maxLap) * 100}%`
  const bands = (events?.periods ?? []).filter((p) => p.kind !== 'YELLOW')
  const usedCompounds = [...new Set(stints.map((s) => (s.compound ?? '').toUpperCase()))].filter((c) => COMPOUND_STYLE[c])

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
        {usedCompounds.map((c) => (
          <span key={c} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COMPOUND_STYLE[c].color }} />
            {c.charAt(0) + c.slice(1).toLowerCase()}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-0.5 rounded-full bg-text" /> Pit stop
        </span>
        <span className="ml-auto">Tap a driver to add / remove them from the charts</span>
      </div>
      <div className="relative">
        {/* Neutralisation shading behind every row. */}
        <div className="pointer-events-none absolute inset-y-0 left-10 right-0">
          {bands.map((p, i) => (
            <span
              key={i}
              className="absolute inset-y-0"
              style={{
                left: pct(p.startLap - 1),
                width: pct(p.endLap - p.startLap + 1),
                backgroundColor: `${RACE_EVENT_STYLE[p.kind].color}22`,
              }}
              title={`${RACE_EVENT_STYLE[p.kind].label} · laps ${p.startLap}–${p.endLap}`}
            />
          ))}
        </div>
        <div className="relative space-y-1">
          {rows.map(({ driver, n, stints: ds }) => {
            const on = selected.includes(n)
            const pits = (events?.pitStops ?? []).filter((p) => p.driverNumber === n)
            return (
              <button
                key={n}
                type="button"
                onClick={() => onToggle(n)}
                className={`flex w-full items-center gap-2 rounded-sm text-left transition-opacity ${on ? '' : 'opacity-55 hover:opacity-90'}`}
                title={driver?.name}
              >
                <span
                  className="w-8 shrink-0 border-l-2 pl-1 font-mono text-[10px] font-bold text-text"
                  style={{ borderColor: driver?.teamColour ?? '#9ca3af' }}
                >
                  {driver?.abbr ?? `#${n}`}
                </span>
                <span className="relative h-3.5 flex-1">
                  {ds.map((s) => {
                    const cs = compoundStyle(s.compound)
                    return (
                      <span
                        key={s.stintNumber}
                        className="absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-[3px] border border-black/60 font-mono text-[8px] font-black text-black"
                        style={{
                          left: pct(s.startLap - 1),
                          width: pct(s.endLap - s.startLap + 1),
                          backgroundColor: cs.color,
                        }}
                        title={`${s.compound} · laps ${s.startLap}–${s.endLap} (${s.totalLaps})${
                          s.averageDegPerLap != null ? ` · ${s.averageDegPerLap > 0 ? '+' : ''}${s.averageDegPerLap.toFixed(3)}s/lap` : ''
                        }`}
                      >
                        {s.totalLaps >= 4 ? cs.letter : ''}
                      </span>
                    )
                  })}
                  {pits.map((p) => (
                    <span
                      key={p.lap}
                      className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-text"
                      style={{ left: pct(p.lap) }}
                      title={`Pit · lap ${p.lap} · ${formatPitTime(p)}`}
                    />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex justify-between pl-10 font-mono text-[9px] text-muted">
        <span>L1</span>
        <span>L{Math.round(maxLap / 2)}</span>
        <span>L{maxLap}</span>
      </div>
    </div>
  )
}

/** Pit stops for the selected drivers: lap, tyre change, stationary + lane time. */
export function PitStopTable({
  drivers,
  selected,
  stints,
  events,
  onJump,
}: {
  drivers: TelemetryDriver[]
  selected: number[]
  stints: Stint[]
  events: RaceEvents | null
  onJump: (driverNumber: number, lap: number) => void
}) {
  const stops = (events?.pitStops ?? []).filter((p) => selected.includes(p.driverNumber))
  if (!stops.length) return null
  const hasStationary = stops.some((s) => s.stopSec != null)
  const compoundAfter = (dn: number, lap: number) =>
    stints.find((s) => s.driverNumber === dn && s.startLap > lap && s.startLap <= lap + 2)?.compound
  const compoundBefore = (dn: number, lap: number) =>
    stints.find((s) => s.driverNumber === dn && s.startLap <= lap && s.endLap >= lap)?.compound

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-left font-mono text-[11px]">
        <thead className="border-b border-border text-[9px] uppercase tracking-widest text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">Driver</th>
            <th className="px-2 py-2 font-semibold">Lap</th>
            <th className="px-2 py-2 font-semibold">Tyres</th>
            {hasStationary && <th className="px-2 py-2 text-right font-semibold">Stop</th>}
            <th className="px-2 py-2 text-right font-semibold">Lane</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {stops.map((s) => {
            const d = drivers.find((x) => x.number === s.driverNumber)
            const from = compoundBefore(s.driverNumber, s.lap)
            const to = compoundAfter(s.driverNumber, s.lap)
            return (
              <tr key={`${s.driverNumber}:${s.lap}`} className="text-text">
                <td className="px-3 py-1.5">
                  <span className="border-l-2 pl-1.5 font-bold" style={{ borderColor: d?.teamColour ?? '#9ca3af' }}>
                    {d?.abbr ?? `#${s.driverNumber}`}
                  </span>
                </td>
                <td className="px-2 py-1.5 tabular-nums">{s.lap}</td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-1">
                    <CompoundDot compound={from} />
                    <span className="text-muted">→</span>
                    <CompoundDot compound={to} />
                  </span>
                </td>
                {hasStationary && (
                  <td className="px-2 py-1.5 text-right tabular-nums">{s.stopSec != null ? `${s.stopSec.toFixed(1)}s` : '—'}</td>
                )}
                <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                  {s.laneSec != null ? `${s.laneSec.toFixed(1)}s` : '—'}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button type="button" onClick={() => onJump(s.driverNumber, s.lap)} className="text-accent hover:underline">
                    Watch
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CompoundDot({ compound }: { compound: string | undefined }) {
  if (!compound) return <span className="text-muted">?</span>
  const cs = compoundStyle(compound)
  return (
    <span
      className="flex h-4 w-4 items-center justify-center rounded-full border-2 text-[8px] font-black text-text"
      style={{ borderColor: cs.color }}
      title={compound}
    >
      {cs.letter}
    </span>
  )
}

/** Air / track temperature range, humidity, wind and rain laps across the race. */
export function ConditionsStrip({ weather }: { weather: LapWeather[] }) {
  if (!weather.length) return null
  const range = (xs: number[]) => {
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)
    return Math.round(lo) === Math.round(hi) ? `${Math.round(lo)}` : `${Math.round(lo)}–${Math.round(hi)}`
  }
  const rainLaps = weather.filter((w) => w.rainfall).map((w) => w.lap)
  const tiles = [
    { icon: <Thermometer size={14} />, label: 'Track', value: `${range(weather.map((w) => w.trackTemp))}°C` },
    { icon: <Thermometer size={14} weight="light" />, label: 'Air', value: `${range(weather.map((w) => w.airTemp))}°C` },
    { icon: <Drop size={14} />, label: 'Humidity', value: `${range(weather.map((w) => w.humidity))}%` },
    { icon: <Wind size={14} />, label: 'Wind', value: `${range(weather.map((w) => w.windSpeed * 3.6))} km/h` },
    {
      icon: <CloudRain size={14} />,
      label: 'Rain',
      value: rainLaps.length ? `L${rainLaps[0]}–${rainLaps[rainLaps.length - 1]}` : 'Dry',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-border bg-surface px-3 py-2">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted">
            {t.icon}
            {t.label}
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-text">{t.value}</div>
        </div>
      ))}
    </div>
  )
}
