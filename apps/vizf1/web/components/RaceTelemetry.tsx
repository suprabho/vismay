'use client'

import { useMemo, useState } from 'react'
import { ArrowCounterClockwise, Cube, MapTrifold } from '@phosphor-icons/react'
import { RACE_EVENT_KINDS, RACE_EVENT_STYLE, formatPitTime, type RaceEventKind } from '@vismay/f1-viz/web'
import VizMount from './VizMount'
import { ConditionsStrip, PitStopTable, TyreStrategy } from './telemetry/StrategyPanels'
import { useTelemetrySession } from '@/lib/useTelemetrySession'
import { useTelemetryLaps } from '@/lib/useTelemetryLaps'
import { useRaceEvents } from '@/lib/useRaceEvents'
import { useSessionStrategy } from '@/lib/useSessionStrategy'
import { LAP_METRICS, buildLapChartSpec, type LapMetric } from '@/lib/lapChart'

function Panel({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        <div className="flex items-center gap-2">
          {hint ? <span className="text-[10px] text-muted">{hint}</span> : null}
          {action}
        </div>
      </div>
      {children}
    </section>
  )
}

const METRIC_ORDER: LapMetric[] = ['lapTime', 's1', 's2', 's3', 'position', 'maxSpeed', 'avgSpeed', 'throttle', 'gapAhead', 'drs', 'braking']
const CLIP_CHANNELS = ['speed', 'throttle', 'brake', 'nGear', 'drs', 'rpm']

/**
 * Race-page Telemetry tab. A clip of a lap window — the 2D telemetry player or
 * the orbit-able 3D track — auto-set to the fastest-lap window; a per-lap
 * analysis chart (lap / sector times, position, speed, throttle, gap, DRS,
 * braking) with slow-lap filtering and race-event overlays (SC / VSC / red /
 * yellow periods + pit stops); and tyre strategy, pit stops and conditions.
 * The driver chips drive every panel; event chips jump the clip to that moment.
 */
export function RaceTelemetry({ raceName }: { raceName: string }) {
  const sessionQ = useTelemetrySession(raceName)
  const session = sessionQ.data ?? null
  const sessionKey = session?.sessionKey ?? null

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

  const laps = useTelemetryLaps(sessionKey, selected)
  const eventsQ = useRaceEvents(sessionKey)
  const events = eventsQ.data ?? null
  const strategy = useSessionStrategy(sessionKey).data ?? null

  // Target the fastest lap that has channel telemetry — when a session's feed
  // broke mid-race, the absolute fastest lap may have nothing to play.
  const fastest = laps.data?.fastestWithTelemetry ?? null
  const fastestIsPartial =
    fastest != null && laps.data?.fastest != null && fastest.lap !== laps.data.fastest.lap
  const maxLap = laps.data?.maxLap ?? 0

  // Clip window: explicit override, else the fastest-lap window, else opening laps.
  const [rangeOverride, setRangeOverride] = useState<[number, number] | null>(null)
  const [focalOverride, setFocalOverride] = useState<number | null>(null)
  const window: [number, number] = rangeOverride ?? (fastest
    ? [Math.max(1, fastest.lap - 1), fastest.lap + 1]
    : [1, 3])
  const [lapFrom, lapTo] = window
  const clipDrivers = selected.slice(0, 3)
  const focal =
    focalOverride != null && clipDrivers.includes(focalOverride)
      ? focalOverride
      : fastest && clipDrivers.includes(fastest.driverNumber)
        ? fastest.driverNumber
        : clipDrivers[0]

  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [metric, setMetric] = useState<LapMetric>('lapTime')
  const [hideSlow, setHideSlow] = useState(true)
  const [hiddenKinds, setHiddenKinds] = useState<Set<RaceEventKind>>(() => new Set())
  const [showPits, setShowPits] = useState(true)

  const toggleDriver = (n: number) => {
    const base = selOverride ?? defaultSel
    setSelOverride(base.includes(n) ? base.filter((x) => x !== n) : [...base, n])
  }
  const setLap = (which: 0 | 1, v: number) => {
    const clamped = Math.max(1, maxLap ? Math.min(maxLap, v) : v)
    const next: [number, number] = which === 0 ? [clamped, window[1]] : [window[0], clamped]
    setRangeOverride([Math.min(next[0], next[1]), Math.max(next[0], next[1])])
  }
  const jumpTo = (from: number, to: number, driver?: number) => {
    const hi = maxLap || to
    setRangeOverride([Math.max(1, Math.min(from, hi)), Math.max(1, Math.min(to, hi))])
    if (driver != null) {
      if (!selected.slice(0, 3).includes(driver)) {
        // Put the driver in the clip's first three so the jump actually shows them.
        setSelOverride([driver, ...selected.filter((x) => x !== driver)])
      }
      setFocalOverride(driver)
    }
  }
  const toggleKind = (k: RaceEventKind) =>
    setHiddenKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const clipEvents = useMemo(
    () =>
      events
        ? {
            ...events,
            periods: events.periods.filter((p) => !hiddenKinds.has(p.kind)),
            pitStops: showPits ? events.pitStops : [],
          }
        : undefined,
    [events, hiddenKinds, showPits],
  )

  const clipConfig = useMemo(
    () =>
      sessionKey && clipDrivers.length
        ? {
            type: 'f1:telemetry-clip',
            sessionKey,
            driverNumbers: clipDrivers,
            lapFrom,
            lapTo,
            focalDriverNumber: focal,
            channels: CLIP_CHANNELS,
            autoPlay: true,
            ...(clipEvents ? { raceEvents: clipEvents } : {}),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionKey, clipDrivers.join(','), lapFrom, lapTo, focal, clipEvents],
  )
  const track3dConfig = useMemo(
    () =>
      sessionKey && selected.length
        ? {
            type: 'f1:track-3d',
            sessionKey,
            driverNumbers: selected,
            lapFrom,
            lapTo,
            focalDriverNumber: focal,
            cameraMode: 'chase',
            interactive: true,
            autoPlay: true,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionKey, selected.join(','), lapFrom, lapTo, focal],
  )

  const chart = useMemo(() => {
    if (!sessionKey || !session || !laps.data) return null
    return buildLapChartSpec(sessionKey, laps.data.rows, session.drivers, selected, events, laps.data.fastest, {
      metric,
      hideSlowLaps: hideSlow,
      showKinds: new Set(RACE_EVENT_KINDS.filter((k) => !hiddenKinds.has(k))),
      showPits,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, session, laps.data, selected.join(','), events, metric, hideSlow, hiddenKinds, showPits])
  const chartConfig = useMemo(
    () => (chart?.spec ? { type: 'f1:telemetry-chart', spec: chart.spec } : null),
    [chart?.spec],
  )

  if (sessionQ.isLoading) return <Empty label="Loading telemetry…" />
  if (!session) return <Empty label="No telemetry for this round yet." />
  if (!session.ready) return <Empty label="Telemetry is still processing for this session — check back shortly." />

  const presentKinds = RACE_EVENT_KINDS.filter((k) => events?.periods.some((p) => p.kind === k))
  const driverAbbr = (n: number) => session.drivers.find((d) => d.number === n)?.abbr ?? `#${n}`
  const selectedPits = (events?.pitStops ?? []).filter((p) => selected.includes(p.driverNumber))
  const metricDef = LAP_METRICS[metric]

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
              onClick={() => {
                setRangeOverride(null)
                setFocalOverride(null)
              }}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-accent hover:underline"
            >
              <ArrowCounterClockwise size={12} />
              {fastestIsPartial ? 'fastest telemetry lap' : 'fastest lap'} ({driverAbbr(fastest.driverNumber)}, L{fastest.lap})
            </button>
          ) : null}
          <span className="ml-auto text-[10px]">Clip shows the first 3 selected drivers.</span>
        </div>
        {(events?.periods.length || selectedPits.length) ? (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px]">
            <span className="mr-1 shrink-0 text-[10px] uppercase tracking-wide text-muted">Jump to</span>
            {events?.periods
              .filter((p) => p.kind !== 'YELLOW')
              .map((p, i) => {
                const style = RACE_EVENT_STYLE[p.kind]
                return (
                  <button
                    key={`p${i}`}
                    type="button"
                    onClick={() => jumpTo(Math.max(1, p.startLap - 1), p.endLap + 1)}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-text hover:border-text/40"
                    title={p.message ?? style.label}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.color }} />
                    {style.short} L{p.startLap}
                    {p.endLap !== p.startLap ? `–${p.endLap}` : ''}
                  </button>
                )
              })}
            {selectedPits.map((p) => {
              const d = session.drivers.find((x) => x.number === p.driverNumber)
              return (
                <button
                  key={`s${p.driverNumber}:${p.lap}`}
                  type="button"
                  onClick={() => jumpTo(p.lap, p.lap + 1, p.driverNumber)}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-text hover:border-text/40"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d?.teamColour ?? '#9ca3af' }} />
                  {d?.abbr ?? `#${p.driverNumber}`} pit L{p.lap} · {formatPitTime(p)}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <Panel
        title="Telemetry clip"
        hint={`laps ${lapFrom}–${lapTo}`}
        action={
          <div className="flex rounded-full border border-border p-0.5" role="tablist" aria-label="Clip view">
            {(
              [
                ['2d', '2D', <MapTrifold key="2d" size={12} />],
                ['3d', '3D', <Cube key="3d" size={12} />],
              ] as const
            ).map(([v, label, icon]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  view === v ? 'bg-text text-bg' : 'text-muted hover:text-text'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        }
      >
        {/* A definite height (not min-height): the clip sizes itself to its host,
            and an auto-height host left the compact layout short with a blank gap. */}
        <div className="h-[460px] overflow-hidden rounded-xl border border-border bg-surface sm:h-[500px]">
          {view === '2d' ? (
            clipConfig ? <VizMount type="f1:telemetry-clip" config={clipConfig} /> : <Empty label="Select at least one driver." />
          ) : track3dConfig ? (
            <VizMount type="f1:track-3d" config={track3dConfig} />
          ) : (
            <Empty label="Select at least one driver." />
          )}
        </div>
        {view === '3d' ? (
          <p className="text-[10px] text-muted">
            Drag to orbit, scroll to zoom. Shows every selected driver over the clip laps; pick a camera from the overlay.
          </p>
        ) : null}
      </Panel>

      <Panel
        title="Lap analysis"
        hint={chart && chart.hidden > 0 && hideSlow ? `${chart.hidden} slow laps hidden` : undefined}
      >
        <div className="space-y-2 rounded-xl border border-border bg-surface p-2">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {METRIC_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  metric === m ? 'bg-text font-semibold text-bg' : 'text-muted hover:text-text'
                }`}
              >
                {LAP_METRICS[m].label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2 text-[11px]">
            {!metricDef.unfiltered ? (
              <Toggle on={hideSlow} onClick={() => setHideSlow((v) => !v)} title="Lap 1, in / out laps, SC / VSC / red-flag laps and laps 7% off the driver's median">
                Hide slow laps
              </Toggle>
            ) : null}
            {presentKinds.map((k) => (
              <Toggle key={k} on={!hiddenKinds.has(k)} onClick={() => toggleKind(k)} color={RACE_EVENT_STYLE[k].color}>
                {RACE_EVENT_STYLE[k].label}
              </Toggle>
            ))}
            {events?.pitStops.length ? (
              <Toggle on={showPits} onClick={() => setShowPits((v) => !v)} color="#f5f5f5">
                Pit stops
              </Toggle>
            ) : null}
            {events?.source === 'timing' ? (
              <span className="text-[10px] text-muted">SC and VSC from timing flags (not told apart)</span>
            ) : null}
          </div>
          <div className="h-[380px]">
            {laps.isLoading ? (
              <Empty label="Loading lap data…" />
            ) : chartConfig ? (
              <VizMount type="f1:telemetry-chart" config={chartConfig} />
            ) : (
              <Empty label={`No ${metricDef.label.toLowerCase()} data for the selected drivers.`} />
            )}
          </div>
        </div>
      </Panel>

      {strategy?.stints.length ? (
        <Panel title="Tyre strategy">
          <TyreStrategy
            drivers={session.drivers}
            order={session.finishingOrder}
            stints={strategy.stints}
            events={events}
            selected={selected}
            onToggle={toggleDriver}
          />
        </Panel>
      ) : null}

      {selectedPits.length ? (
        <Panel title="Pit stops" hint={events?.source === 'openf1' ? 'stationary + pit-lane time' : 'pit-lane time'}>
          <PitStopTable
            drivers={session.drivers}
            selected={selected}
            stints={strategy?.stints ?? []}
            events={events}
            onJump={(dn, lap) => jumpTo(lap, lap + 1, dn)}
          />
        </Panel>
      ) : null}

      {strategy?.weather.length ? (
        <Panel title="Conditions">
          <ConditionsStrip weather={strategy.weather} />
        </Panel>
      ) : null}
    </div>
  )
}

function Toggle({
  on,
  onClick,
  color,
  title,
  children,
}: {
  on: boolean
  onClick: () => void
  color?: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors ${
        on ? 'border-text/30 text-text' : 'border-border text-muted line-through decoration-muted/60'
      }`}
    >
      {color ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, opacity: on ? 1 : 0.4 }} /> : null}
      {children}
    </button>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[8rem] items-center justify-center rounded-xl border border-border bg-surface p-4 text-center text-xs text-muted">
      {label}
    </div>
  )
}
