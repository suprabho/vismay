'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { RaceRow } from '@vismay/f1-viz/types'
import { findGrandPrix, flagUrl } from '@vismay/f1-viz/grands-prix'
import { useSchedule } from '@/lib/useSchedule'
import { useSessionResults } from '@/lib/useSessionResults'
import { raceDayLabel, racesByStatus } from '@/lib/raceCalendar'
import { DriverAvatar } from '@/components/DriverAvatar'
import { Podium, PodiumMessage } from '@/components/Podium'

function RacePodium({ race }: { race: RaceRow }) {
  const q = useSessionResults(race.round, 'race')
  const topThree = (q.data ?? []).filter(r => r.position != null && r.position >= 1 && r.position <= 3)
  return (
    <section id="race-podium" aria-label={`${race.raceName} podium`} aria-live="polite" className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <p className="wdth-kicker text-[11px] font-bold uppercase tracking-[0.14em] text-muted">ROUND {String(race.round).padStart(2, '0')} / RACE PODIUM</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{race.raceName}</h3>
          <p className="mt-1 text-xs text-muted">{race.circuitName} · {raceDayLabel(race, { day: 'numeric', month: 'short' })}</p>
        </div>
        <Link href={`/race/${race.round}`} className="rounded-md py-2 text-xs text-text hover:text-accent">Full race details →</Link>
      </div>
      {q.isLoading ? <PodiumMessage>Loading race results…</PodiumMessage>
        : q.error ? <PodiumMessage error>Could not load race results. Please try again later.</PodiumMessage>
        : !topThree.length ? <PodiumMessage>Results are not available yet.</PodiumMessage>
        : <div className="mx-auto max-w-2xl"><Podium label={`${race.raceName} top three`} entries={topThree.map(r => ({
          id: r.driverId, position: r.position!, name: r.driverName, subtitle: r.constructorName ?? '',
          color: r.constructorColor, href: `/driver/${r.driverId}`,
          avatar: <DriverAvatar name={r.driverName} code={r.driverCode} headshotUrl={r.headshotUrl} accent={r.constructorColor} />,
          // This source has gaps, not total race duration. Never substitute best lap time.
          value: r.position === 1 ? <span className="font-sans wdth-body">Winner</span> : r.gapToLeaderMs != null && r.gapToLeaderMs > 0
            ? <span className="italic">+{(r.gapToLeaderMs / 1000).toFixed(3)}s</span> : <span className="font-sans wdth-body">{r.status && r.status !== 'Finished' ? r.status : 'Finished'}</span>,
          detail: r.points != null ? <><span className="font-mono">{r.points}</span> points</> : r.lapsCompleted != null ? <><span className="font-mono">{r.lapsCompleted}</span> laps</> : undefined,
        }))} /></div>}
    </section>
  )
}

export function RaceWeekends() {
  const q = useSchedule()
  const races = racesByStatus(q.data ?? [], 'finished')
  const liveRaces = racesByStatus(q.data ?? [], 'live')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = races.find(r => r.id === selectedId) ?? races.at(-1)
  const rail = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  useEffect(() => {
    const element = rail.current
    if (!element) return
    const update = () => setEdges({ start: element.scrollLeft < 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 })
    const button = element.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
    if (button) element.scrollLeft += button.getBoundingClientRect().left - element.getBoundingClientRect().left - (element.clientWidth - button.clientWidth) / 2
    update()
    element.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => { element.removeEventListener('scroll', update); observer.disconnect() }
  }, [selected?.id, races.length])

  function scroll(direction: number) {
    rail.current?.scrollBy({ left: direction * 300, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  return (
    <section className="mt-8" aria-labelledby="race-weekends-heading">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><h2 id="race-weekends-heading" className="wdth-body text-lg font-semibold">Race weekends</h2><p className="mt-1 text-xs text-muted">{races.length} completed races</p></div>
        {races.length > 0 && <div className="flex gap-2">
          <button type="button" onClick={() => scroll(-1)} disabled={edges.start} aria-label="Earlier races" className="h-11 w-11 rounded-full border border-border bg-surface disabled:opacity-30">←</button>
          <button type="button" onClick={() => scroll(1)} disabled={edges.end} aria-label="Later races" className="h-11 w-11 rounded-full border border-border bg-surface disabled:opacity-30">→</button>
        </div>}
      </div>
      {liveRaces.map(r => <Link key={r.id} href={`/race/${r.round}`} className="mb-3 block rounded-xl border border-accent/50 bg-surface p-4 text-sm">{r.raceName} · Race in progress / awaiting final results →</Link>)}
      {q.isLoading ? <PodiumMessage>Loading races…</PodiumMessage>
        : q.error ? <PodiumMessage error>Could not load the race calendar. Please try again later.</PodiumMessage>
        : !selected ? <PodiumMessage>No completed races yet this season.</PodiumMessage>
        : <>
          <div ref={rail} role="group" aria-label="Choose a completed race" className="mb-3 flex snap-x snap-proximity gap-2.5 overflow-x-auto px-1 pt-1 pb-3">
            {races.map(r => {
              const gp = findGrandPrix(r.raceName)
              const active = r.id === selected.id
              const latest = r.id === races.at(-1)?.id
              return <button key={r.id} type="button" aria-pressed={active} aria-controls="race-podium" onClick={() => setSelectedId(r.id)} className={`w-40 shrink-0 snap-center rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-accent ${active ? 'border-accent bg-accent/10 shadow-[inset_0_-3px_var(--color-accent)]' : 'border-border bg-surface hover:border-muted'}`}>
                <span className="flex items-center justify-between text-[11px] text-muted">
                  ROUND {String(r.round).padStart(2, '0')}
                  {/* Match the existing schedule's small, externally hosted flag thumbnails. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {gp && <img src={flagUrl(gp.code, 80)} alt="" width={20} height={14} className="h-3.5 w-5 object-cover" />}
                </span>
                <span className="mt-2 block text-sm font-semibold">{r.raceName.replace(/ Grand Prix$/, '')}</span>
                <span className="mt-1 block text-[11px] text-muted">{raceDayLabel(r, { day: 'numeric', month: 'short' })}</span>
                <span className={`mt-3 block text-[11px] ${active ? 'font-semibold text-text' : 'text-muted'}`}>✓ {latest ? 'Latest completed' : 'Completed'}</span>
              </button>
            })}
          </div>
          <RacePodium key={selected.id} race={selected} />
        </>}
    </section>
  )
}
