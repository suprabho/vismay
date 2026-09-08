'use client'

import { useDriverStandings, useConstructorStandings } from '@/lib/useStandings'
import { DriverAvatar } from '@/components/DriverAvatar'
import { TeamBadge } from '@/components/TeamBadge'
import { Podium, PodiumMessage } from '@/components/Podium'

function DriverPodium() {
  const q = useDriverStandings()
  if (q.isLoading) return <PodiumMessage>Loading driver standings…</PodiumMessage>
  if (q.error) return <PodiumMessage error>Could not load driver standings. Please try again later.</PodiumMessage>
  if (!q.data?.length) return <PodiumMessage>No driver standings yet this season.</PodiumMessage>
  return <Podium label="Top three drivers" entries={q.data.filter(r => r.position <= 3).map(r => ({
    id: r.driverId, position: r.position, name: r.driverName, subtitle: r.constructorName,
    color: r.constructorColor, href: `/driver/${r.driverId}`,
    avatar: <DriverAvatar name={r.driverName} code={r.driverCode} headshotUrl={r.headshotUrl} accent={r.constructorColor} />,
    value: <>{r.points} <span className="text-[11px] font-normal text-muted">PTS</span></>,
  }))} />
}

function ConstructorPodium() {
  const q = useConstructorStandings()
  if (q.isLoading) return <PodiumMessage>Loading constructor standings…</PodiumMessage>
  if (q.error) return <PodiumMessage error>Could not load constructor standings. Please try again later.</PodiumMessage>
  if (!q.data?.length) return <PodiumMessage>No constructor standings yet this season.</PodiumMessage>
  return <Podium label="Top three constructors" entries={q.data.filter(r => r.position <= 3).map(r => ({
    id: r.constructorId, position: r.position, name: r.constructorName, subtitle: 'Constructor',
    color: r.primaryColor, href: `/team/${r.constructorId}`,
    avatar: <TeamBadge constructorId={r.constructorId} name={r.constructorName} logoUrl={r.logoUrl} color={r.primaryColor} size="lg" />,
    value: <>{r.points} <span className="text-[11px] font-normal text-muted">PTS</span></>,
  }))} />
}

export function ChampionshipPodiums() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[
        { id: 'drivers', title: 'Drivers', content: <DriverPodium /> },
        { id: 'constructors', title: 'Constructors', content: <ConstructorPodium /> },
      ].map(({ id, title, content }) => (
        <section key={id} id={id} aria-labelledby={`${id}-heading`} className="min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <div><h2 id={`${id}-heading`} className="wdth-body text-lg font-semibold">{title}</h2><p className="mt-1 text-xs text-muted">Championship standings</p></div>
            <span className="wdth-kicker text-[11px] font-bold uppercase tracking-[0.14em] text-muted">TOP 3</span>
          </div>
          {content}
        </section>
      ))}
    </div>
  )
}
