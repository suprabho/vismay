'use client'

import { useState } from 'react'
import Link from 'next/link'
import { findGrandPrix, flagUrl, type GrandPrixEntry } from '@vismay/f1-viz/grands-prix'
import { useSchedule } from '@/lib/useSchedule'
import { calendarDays, raceDateLabel, racesByStatus, shiftMonth } from '@/lib/raceCalendar'
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
  const upcoming = racesByStatus(q.data ?? [], 'upcoming')
  const firstMonth = upcoming[0]?.date.slice(0, 7)
  const lastMonth = upcoming.at(-1)?.date.slice(0, 7)
  const [chosenMonth, setChosenMonth] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const month = chosenMonth && firstMonth && lastMonth && chosenMonth >= firstMonth && chosenMonth <= lastMonth ? chosenMonth : firstMonth
  const monthRaces = upcoming.filter(r => r.date.startsWith(month ?? ''))
  const selected = monthRaces.find(r => r.id === selectedId) ?? monthRaces[0]
  const selectedGp = selected ? findGrandPrix(selected.raceName) : null
  const monthLabel = month ? raceDateLabel(`${month}-01`, { month: 'long', year: 'numeric' }) : ''

  return (
    <section id="calendar" aria-labelledby="upcoming-heading" className="mt-8 scroll-mt-24">
      <div className="mb-4"><h2 id="upcoming-heading" className="text-lg font-semibold">Upcoming races</h2><p className="mt-1 text-xs text-muted">Race-day calendar · Dates and start times in UTC</p></div>
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
            <div role="group" aria-label={`${monthLabel} race days`} className="px-2 pb-4 sm:px-5">
              <div className="mb-2 grid grid-cols-7 text-center text-[11px] text-muted">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span key={d}>{d}</span>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays(month).map((date, i) => {
                  const races = monthRaces.filter(r => r.date === date)
                  const active = races.some(r => r.id === selected?.id)
                  const gp = races[0] ? findGrandPrix(races[0].raceName) : null
                  return <div key={date ?? `blank-${i}`} className={`min-h-20 min-w-0 rounded-lg sm:min-h-28 ${date ? i % 7 >= 5 ? 'bg-border/50' : 'bg-bg/60' : ''}`}>
                    {date && (races.length ? <button type="button" onClick={() => setSelectedId(races[0].id)} aria-pressed={active} aria-controls="upcoming-race-details" aria-label={`${raceDateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${races.map(r => r.raceName).join(', ')}`} style={{ backgroundColor: countryTint(gp, active ? 34 : 18) }} className={`flex h-full min-h-20 w-full flex-col items-center gap-1 rounded-lg border px-0.5 py-2 text-center sm:min-h-28 sm:px-1 ${active ? 'border-accent shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'border-border hover:border-muted'}`}>
                      <span className="text-xs font-semibold">{Number(date.slice(-2))}</span>
                      {races.map(r => <span key={r.id} className="flex w-full flex-col items-center gap-1 text-[11px] leading-tight break-words text-text"><CalendarFlag gp={findGrandPrix(r.raceName)} /><span className="font-semibold">R{r.round}</span><span className="hidden sm:block">{r.raceName.replace(/ Grand Prix$/, '')}</span></span>)}
                      <span aria-hidden="true" className="mt-auto h-1 w-3 rounded-full" style={{ backgroundColor: gp?.accent ?? 'var(--color-accent)' }} />
                    </button> : <span className="block py-2 text-center text-xs text-muted">{Number(date.slice(-2))}</span>)}
                  </div>
                })}
              </div>
            </div>
            <div id="upcoming-race-details" aria-live="polite" className="border-t border-border p-4 sm:px-5" style={selected ? { backgroundColor: countryTint(selectedGp, 10) } : undefined}>
              {selected ? <>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wide text-muted"><span>ROUND {String(selected.round).padStart(2, '0')}</span>{selected.id === upcoming[0]?.id && <span className="text-accent">UP NEXT</span>}{selected.hasSprint && <span className="rounded border border-border px-2 py-0.5">SPRINT WEEKEND</span>}</div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3"><CalendarFlag gp={selectedGp} large /><div className="min-w-0"><h4 className="text-lg font-semibold">{selected.raceName}</h4><p className="mt-1 text-xs text-muted">{selected.circuitName}{selected.locality ? ` · ${selected.locality}` : ''}</p><p className="mt-2 text-sm">{raceDateLabel(selected.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {selected.time ? `${selected.time.slice(0, 5)} UTC` : 'Start time TBC'}</p></div></div>
                  <Link href={`/race/${selected.round}`} className="rounded-lg border border-border px-4 py-3 text-xs font-medium hover:border-accent">Race weekend →</Link>
                </div>
                {monthRaces.length > 1 && <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Races this month">{monthRaces.map(r => <button key={r.id} type="button" aria-pressed={selected.id === r.id} onClick={() => setSelectedId(r.id)} style={{ backgroundColor: countryTint(findGrandPrix(r.raceName), selected.id === r.id ? 24 : 10) }} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs ${selected.id === r.id ? 'border-accent' : 'border-border hover:border-muted'}`}><CalendarFlag gp={findGrandPrix(r.raceName)} />{raceDateLabel(r.date)} · {r.raceName.replace(/ Grand Prix$/, '')}</button>)}</div>}
              </> : <p className="text-sm text-muted">No upcoming races this month.</p>}
            </div>
          </>}
      </div>
    </section>
  )
}
