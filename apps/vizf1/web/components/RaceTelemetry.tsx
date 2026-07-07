'use client'

import { useMemo, useState } from 'react'
import VizMount from './VizMount'
import { useTelemetrySession } from '@/lib/useTelemetrySession'
import { useTelemetryLaps } from '@/lib/useTelemetryLaps'

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {hint ? <span className="text-[10px] text-muted">{hint}</span> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * Race-page Telemetry tab: real telemetry widgets for the round's race session.
 * A 2D clip auto-set to the fastest-lap window and a lap-time-by-lap chart. A
 * driver multiselect drives the chart + clip; a lap-range control retargets the
 * clip. (The orbit-able 3D track now lives on the Race Replay page.)
 */
export function RaceTelemetry({ raceName }: { raceName: string }) {
  const sessionQ = useTelemetrySession(raceName)
  const session = sessionQ.data ?? null

  // Default selection: top-3 finishers (fallback to the first roster drivers).
  const defaultSel = useMemo(() => {
    if (!session) return []
    const order = session.finishingOrder.length
      ? session.finishingOrder
      : session.drivers.map((d) => d.number)
    return order.slice(0, 3)
  }, [session])

  const [selOverride, setSelOverride] = useState<number[] | null>(null)
  const selected = selOverride ?? defaultSel

  const laps = useTelemetryLaps(session?.sessionKey ?? null, session?.drivers ?? [], selected)
  const fastest = laps.data?.fastest ?? null
  const maxLap = laps.data?.maxLap ?? 0

  // Clip window: explicit override, else the fastest-lap window, else opening laps.
  const [rangeOverride, setRangeOverride] = useState<[number, number] | null>(null)
  const window: [number, number] = rangeOverride ?? (fastest
    ? [Math.max(1, fastest.lap - 1), fastest.lap + 1]
    : [1, 3])
  const [lapFrom, lapTo] = window

  const toggleDriver = (n: number) => {
    const base = selOverride ?? defaultSel
    setSelOverride(base.includes(n) ? base.filter((x) => x !== n) : [...base, n])
  }
  const setLap = (which: 0 | 1, v: number) => {
    const clamped = Math.max(1, maxLap ? Math.min(maxLap, v) : v)
    const next: [number, number] = which === 0 ? [clamped, window[1]] : [window[0], clamped]
    setRangeOverride([Math.min(next[0], next[1]), Math.max(next[0], next[1])])
  }

  const clipConfig = useMemo(
    () =>
      session && selected.length
        ? {
            type: 'f1:telemetry-clip',
            sessionKey: session.sessionKey,
            driverNumbers: selected.slice(0, 3),
            lapFrom,
            lapTo,
            focalDriverNumber: fastest?.driverNumber ?? selected[0],
            autoPlay: true,
          }
        : null,
    [session, selected, lapFrom, lapTo, fastest],
  )
  const chartConfig = useMemo(
    () => (laps.data?.spec ? { type: 'f1:telemetry-chart', spec: laps.data.spec, caption: 'Lap time by lap' } : null),
    [laps.data?.spec],
  )

  if (sessionQ.isLoading) return <Empty label="Loading telemetry…" />
  if (!session) return <Empty label="No telemetry for this round yet." />
  if (!session.ready) return <Empty label="Telemetry is still processing for this session — check back shortly." />

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-muted">Drivers</span>
          {session.drivers.map((d) => {
            const on = selected.includes(d.number)
            return (
              <button
                key={d.number}
                type="button"
                onClick={() => toggleDriver(d.number)}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors"
                style={{
                  borderColor: on ? d.teamColour : 'var(--color-border)',
                  backgroundColor: on ? `${d.teamColour}22` : 'transparent',
                  color: on ? 'var(--color-text)' : 'var(--color-muted)',
                }}
                title={`${d.name}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.teamColour }} />
                {d.abbr}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span className="uppercase tracking-wide">Clip laps</span>
          <input
            type="number"
            min={1}
            max={maxLap || undefined}
            value={lapFrom}
            onChange={(e) => setLap(0, Number(e.target.value))}
            className="w-14 rounded-md border border-border bg-bg px-1.5 py-0.5 text-text"
          />
          <span>→</span>
          <input
            type="number"
            min={1}
            max={maxLap || undefined}
            value={lapTo}
            onChange={(e) => setLap(1, Number(e.target.value))}
            className="w-14 rounded-md border border-border bg-bg px-1.5 py-0.5 text-text"
          />
          {fastest ? (
            <button
              type="button"
              onClick={() => setRangeOverride(null)}
              className="rounded-full px-2 py-0.5 text-accent hover:underline"
            >
              ↺ fastest lap (#{fastest.driverNumber}, L{fastest.lap})
            </button>
          ) : null}
          <span className="ml-auto text-[10px]">Clip shows the first 3 selected drivers.</span>
        </div>
      </div>

      <Panel title="Telemetry clip" hint={`laps ${lapFrom}–${lapTo}`}>
        <div className="min-h-[520px] overflow-hidden rounded-xl border border-border bg-surface">
          {clipConfig ? <VizMount type="f1:telemetry-clip" config={clipConfig} /> : <Empty label="Select at least one driver." />}
        </div>
      </Panel>

      <Panel title="Lap times">
        <div className="h-[360px] overflow-hidden rounded-xl border border-border bg-surface p-2">
          {laps.isLoading ? (
            <Empty label="Loading lap times…" />
          ) : chartConfig ? (
            <VizMount type="f1:telemetry-chart" config={chartConfig} />
          ) : (
            <Empty label="No lap-time data for the selected drivers." />
          )}
        </div>
      </Panel>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[8rem] items-center justify-center rounded-xl border border-border bg-surface p-4 text-center text-xs text-muted">
      {label}
    </div>
  )
}
