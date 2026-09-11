'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { RaceRow } from '@vismay/f1-viz/types'
import { findGrandPrix, flagUrl, type GrandPrixEntry } from '@vismay/f1-viz/grands-prix'
import { useSchedule } from '@/lib/useSchedule'
import { calendarWeeks, deviceTimeZone, raceDateLabel, raceDayLabel, racesByStatus, raceTimeLabel, raceWeekend, shiftMonth, weekCells, weekendOverlapsMonth, weekendRangeLabel } from '@/lib/raceCalendar'
import { PodiumMessage } from '@/components/Podium'

function countryTint(gp: GrandPrixEntry | null, percent: number) {
  return `color-mix(in srgb, ${gp?.accent ?? 'var(--color-accent)'} ${percent}%, var(--color-surface))`
}

function CalendarFlag({ gp, large = false }: { gp: GrandPrixEntry | null; large?: boolean }) {
  if (!gp) return null
  // Use the same flag source as the completed-race selector and schedule cards.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={flagUrl(gp.code, large ? 160 : 80)} alt={`${gp.country} flag`} width={large ? 40 : 20} height={large ? 28 : 14} className={`${large ? 'h-7 w-10' : 'h-3.5 w-5'} shrink-0 rounded-sm object-cover`} />
}

export function UpcomingRaceCalendar() {
  const q = useSchedule()
  // The schedule stores the UTC race day; everything below is laid out on the viewer's own calendar
  // (weekend spans, month grouping, start times) so a Sunday-evening race stays on Sunday in Nevada too.
  const upcoming = racesByStatus(q.data ?? [], 'upcoming').map(race => ({ race, weekend: raceWeekend(race) }))
  const firstMonth = upcoming[0]?.weekend.end.slice(0, 7)
  const lastMonth = upcoming.at(-1)?.weekend.end.slice(0, 7)
  const [chosenMonth, setChosenMonth] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const month = chosenMonth && firstMonth && lastMonth && chosenMonth >= firstMonth && chosenMonth <= lastMonth ? chosenMonth : firstMonth
  const monthRaces = upcoming.filter(r => month && weekendOverlapsMonth(r.weekend, month))
  const selected = monthRaces.find(r => r.race.id === selectedId) ?? monthRaces[0]
  const selectedGp = selected ? findGrandPrix(selected.race.raceName) : null
  const monthLabel = month ? raceDateLabel(`${month}-01`, { month: 'long', year: 'numeric' }) : ''
  const timeZone = deviceTimeZone()

  return (
    <section id="calendar" aria-labelledby="upcoming-heading" className="mt-8 scroll-mt-24">
      <div className="mb-4"><h2 id="upcoming-heading" className="text-lg font-semibold">Upcoming races</h2><p className="mt-1 text-xs text-muted">Race weekends · Dates and start times in your local time{timeZone ? ` (${timeZone.replace(/_/g, ' ')})` : ''}</p></div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {q.isLoading ? <PodiumMessage>Loading upcoming races…</PodiumMessage>
          : q.error ? <PodiumMessage error>Could not load upcoming races. Please try again later.</PodiumMessage>
          : !month ? <PodiumMessage>No upcoming races are scheduled for this season.</PodiumMessage>
          : <>
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border bg-bg/40 p-4 sm:px-5">
              <h3 aria-live="polite" className="font-semibold">{monthLabel}</h3>
              <div className="flex gap-2">
                <button type="button" aria-label="Previous month" disabled={month === firstMonth} onClick={() => setChosenMonth(shiftMonth(month, -1))} className="h-11 w-11 rounded-full border border-border disabled:opacity-30">←</button>
                <button type="button" aria-label="Next month" disabled={month === lastMonth} onClick={() => setChosenMonth(shiftMonth(month, 1))} className="h-11 w-11 rounded-full border border-border disabled:opacity-30">→</button>
              </div>
            </div>
            <div role="group" aria-label={`${monthLabel} race weekends`} className="px-2 pb-4 sm:px-5">
              <div className="mb-2 grid grid-cols-7 text-center wdth-dense text-[11px] font-medium text-muted">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span key={d}>{d}</span>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {calendarWeeks(month).flatMap((week, w) => weekCells(week, monthRaces).map(cell => {
                  if (!cell.date) return <div key={`blank-${w}-${cell.column}`} className="min-h-20 min-w-0 rounded-lg sm:min-h-28" />
                  if (!cell.race) return <div key={cell.date} className={`min-h-20 min-w-0 rounded-lg sm:min-h-28 ${cell.column >= 5 ? 'bg-border/50' : 'bg-bg/60'}`}><span className="block py-2 text-center font-mono text-xs text-muted">{Number(cell.date.slice(-2))}</span></div>
                  const race = cell.race
                  return <WeekendCell key={cell.date} race={race} span={cell.span} active={race.id === selected?.race.id} onSelect={() => setSelectedId(race.id)} />
                }))}
              </div>
            </div>
            <div id="upcoming-race-details" aria-live="polite" className="border-t border-border p-4 sm:px-5" style={selected ? { backgroundColor: countryTint(selectedGp, 10) } : undefined}>
              {selected ? <>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wide text-muted"><span>ROUND {String(selected.race.round).padStart(2, '0')}</span>{selected.race.id === upcoming[0]?.race.id && <span className="italic text-accent">UP NEXT</span>}{selected.race.hasSprint && <span className="rounded border border-border px-2 py-0.5">SPRINT WEEKEND</span>}</div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3"><CalendarFlag gp={selectedGp} large /><div className="min-w-0"><h4 className="text-lg font-semibold">{selected.race.raceName}</h4><p className="mt-1 text-xs text-muted">{selected.race.circuitName}{selected.race.locality ? ` · ${selected.race.locality}` : ''}</p><p className="mt-2 text-xs text-muted">Weekend {weekendRangeLabel(selected.weekend)}</p><p className="mt-1 text-sm">Race {raceDayLabel(selected.race)} · {raceTimeLabel(selected.race) ?? 'Start time TBC'}</p></div></div>
                  <Link href={`/race/${selected.race.round}`} className="rounded-lg border border-border px-4 py-3 text-xs font-medium hover:border-accent">Race weekend →</Link>
                </div>
                {monthRaces.length > 1 && <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Races this month">{monthRaces.map(r => <button key={r.race.id} type="button" aria-pressed={selected.race.id === r.race.id} onClick={() => setSelectedId(r.race.id)} style={{ backgroundColor: countryTint(findGrandPrix(r.race.raceName), selected.race.id === r.race.id ? 24 : 10) }} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs ${selected.race.id === r.race.id ? 'border-accent' : 'border-border hover:border-muted'}`}><CalendarFlag gp={findGrandPrix(r.race.raceName)} />{raceDayLabel(r.race, { day: 'numeric', month: 'short' })} · {r.race.raceName.replace(/ Grand Prix$/, '')}</button>)}</div>}
              </> : <p className="text-sm text-muted">No upcoming races this month.</p>}
            </div>
          </>}
      </div>
    </section>
  )
}

type WeekendCellProps = {
  race: RaceRow
  span: number
  active: boolean
  onSelect: () => void
}

/** One race weekend, spanning its visible days in the week row. The span itself marks the dates, so the cell shows only the race. */
function WeekendCell({ race, span, active, onSelect }: WeekendCellProps) {
  const gp = findGrandPrix(race.raceName)
  const weekend = raceWeekend(race)
  const time = raceTimeLabel(race, undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  return (
    <button type="button" onClick={onSelect} aria-pressed={active} aria-controls="upcoming-race-details" aria-label={`${weekendRangeLabel(weekend, { weekday: 'long', day: 'numeric', month: 'long' })}: ${race.raceName}${time ? `, race at ${time}` : ''}`} style={{ gridColumn: `span ${span}`, backgroundColor: countryTint(gp, active ? 34 : 18) }} className={`flex min-h-20 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-0.5 py-2 text-center sm:min-h-28 sm:px-1 ${active ? 'border-accent shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'border-border hover:border-muted'}`}>
      <span className="flex w-full flex-col items-center gap-1 wdth-dense text-[11px] font-medium leading-tight break-words text-text">
        <CalendarFlag gp={gp} />
        <span className="font-mono font-semibold">R{race.round}</span>
        <span className="block w-full truncate">{race.raceName.replace(/ Grand Prix$/, '')}</span>
        {time && <span className="font-mono text-[10px] text-muted">{time}</span>}
      </span>
      <span aria-hidden="true" className="mt-auto h-1 w-3 rounded-full" style={{ backgroundColor: gp?.accent ?? 'var(--color-accent)' }} />
    </button>
  )
}
