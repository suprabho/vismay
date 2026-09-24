'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import type { ConstructorStandingRow, DriverStandingRow } from '../types'

/**
 * Top-three championship podiums — the "Drivers" / "Constructors" cards from
 * the vizf1 For-you feed, lifted into the vertical so stories can embed them.
 * Rows use the same shapes as DriverStandings / ConstructorStandings; anything
 * past P3 is ignored.
 */

type PodiumEntry = {
  id: string
  position: number
  name: string
  subtitle: string
  color: string | null
  avatar: ReactNode
  points: number
  href: string
}

function PodiumCard({ title, label, entries }: { title: string; label: string; entries: PodiumEntry[] }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="wdth-body text-lg font-semibold text-text">{title}</h2>
          <p className="mt-1 text-xs text-muted">Championship standings</p>
        </div>
        <span className="wdth-kicker text-[11px] font-bold uppercase tracking-[0.14em] text-muted">TOP 3</span>
      </div>
      {/* Keep the winning step in the center, even while a result is incomplete. */}
      <div className="grid grid-cols-3 items-end gap-1.5 px-3 pt-6 sm:gap-2 sm:px-5" role="group" aria-label={label}>
        {[2, 1, 3].map((position) => {
          const entry = entries.find((item) => item.position === position)
          const height = position === 1 ? 'min-h-36' : position === 2 ? 'min-h-28' : 'min-h-24'
          return (
            <div key={position} className="min-w-0 text-center" style={{ '--podium-color': entry?.color ?? 'var(--color-border)' } as CSSProperties}>
              <div className="flex min-h-28 flex-col items-center justify-end gap-2 pb-3">
                {entry ? (
                  <Link href={entry.href} className="flex w-full min-w-0 flex-col items-center gap-2 rounded-md hover:underline">
                    {entry.avatar}
                    <span className="wdth-dense text-xs leading-snug font-semibold break-words text-text sm:text-sm">{entry.name}</span>
                    <span className="wdth-dense text-[11px] font-medium leading-snug break-words text-muted">{entry.subtitle}</span>
                  </Link>
                ) : <span className="text-xs text-muted">Awaiting result</span>}
              </div>
              <div
                className={`${height} rounded-t-md border-t-[3px] px-1 py-3`}
                style={{ borderColor: 'var(--podium-color)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--podium-color) 14%, var(--color-surface)), var(--color-surface))' }}
              >
                <span className={`block wdth-display text-2xl leading-none font-extrabold italic ${position === 1 ? 'text-text' : 'text-muted'}`}><span className="sr-only">Position </span>{position}</span>
                <div className="mt-2 font-mono text-sm font-bold tabular-nums text-text">
                  {entry ? <>{entry.points} <span className="text-[11px] font-normal text-muted">PTS</span></> : '—'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DriverHead({ name, code, headshotUrl, color }: {
  name: string
  code: string | null
  headshotUrl: string | null
  color: string | null
}) {
  const ring = color ?? 'var(--color-border)'
  if (headshotUrl) {
    return (
      <span
        className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2"
        style={{ borderColor: ring, backgroundColor: 'var(--color-surface)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={headshotUrl} alt={name} className="h-full w-full object-cover" />
      </span>
    )
  }
  const initials = code ?? name.split(' ').map((p) => p[0]).slice(0, 2).join('')
  return (
    <span
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 wdth-dense text-xs font-semibold text-text"
      style={{ borderColor: ring, backgroundColor: 'var(--color-surface)' }}
    >
      {initials}
    </span>
  )
}

function TeamMark({ name, logoUrl, color }: {
  name: string
  logoUrl: string | null
  color: string | null
}) {
  const tint = color ?? 'var(--color-muted)'
  // Multi-word names use their initials (Red Bull Racing → RBR); single-word
  // names take their first three letters (Ferrari → FER).
  const words = name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/).filter(Boolean)
  const abbr = words.length > 1
    ? words.map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 3)
    : (words[0] ?? '').slice(0, 3).toUpperCase()
  return (
    <span
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md wdth-dense text-sm font-semibold tracking-wide ${logoUrl ? 'p-1.5' : ''}`}
      style={{ backgroundColor: `color-mix(in srgb, ${tint} 13%, transparent)`, color: tint }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="h-full w-full object-contain" />
      ) : abbr}
    </span>
  )
}

export function DriverPodium({ rows, title = 'Drivers' }: { rows: DriverStandingRow[]; title?: string }) {
  return (
    <PodiumCard
      title={title}
      label="Top three drivers"
      entries={rows.filter((r) => r.position <= 3).map((r) => ({
        id: r.driverId,
        position: r.position,
        name: r.driverName,
        subtitle: r.constructorName,
        color: r.constructorColor,
        href: `/driver/${r.driverId}`,
        avatar: <DriverHead name={r.driverName} code={r.driverCode} headshotUrl={r.headshotUrl} color={r.constructorColor} />,
        points: r.points,
      }))}
    />
  )
}

export function ConstructorPodium({ rows, title = 'Constructors' }: { rows: ConstructorStandingRow[]; title?: string }) {
  return (
    <PodiumCard
      title={title}
      label="Top three constructors"
      entries={rows.filter((r) => r.position <= 3).map((r) => ({
        id: r.constructorId,
        position: r.position,
        name: r.constructorName,
        subtitle: 'Constructor',
        color: r.primaryColor,
        href: `/team/${r.constructorId}`,
        avatar: <TeamMark name={r.constructorName} logoUrl={r.logoUrl} color={r.primaryColor} />,
        points: r.points,
      }))}
    />
  )
}
