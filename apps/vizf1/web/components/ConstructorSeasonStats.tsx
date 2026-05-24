'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { PositionChart } from '@vismay/f1-viz/web'
import { ConstructorLogo } from '@/components/ConstructorLogo'
import { DriverAvatar } from '@/components/DriverAvatar'
import { useConstructorStandings } from '@/lib/useStandings'
import { useConstructorStandingsOverTime } from '@/lib/useConstructorStandingsOverTime'
import {
  useConstructorSeasonStats,
  type ConstructorSeasonStats as ConstructorSeasonStatsT,
  type ConstructorGpRow,
} from '@/lib/useConstructorSeasonStats'
import { flagFor, formatOrdinal, positionLabel, shortDate } from '@/lib/formatStats'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

type ConstructorDbRow = {
  constructor_id: string
  name: string
  nationality: string | null
  primary_color: string | null
  logo_url: string | null
}

type DriverDbRow = {
  driver_id: string
  given_name: string
  family_name: string
  code: string | null
  headshot_url: string | null
  primary_color: string | null
}

function useConstructor(constructorId: string) {
  return useQuery({
    queryKey: ['vizf1', 'constructor', constructorId],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<{
      team: ConstructorDbRow | null
      drivers: DriverDbRow[]
    }> => {
      const sb = supabaseBrowser()
      const [team, drivers] = await Promise.all([
        sb
          .from('vizf1_constructors')
          .select('constructor_id, name, nationality, primary_color, logo_url')
          .eq('constructor_id', constructorId)
          .maybeSingle(),
        sb
          .from('vizf1_drivers')
          .select('driver_id, given_name, family_name, code, headshot_url, primary_color')
          .eq('constructor_id', constructorId),
      ])
      return {
        team: (team.data as ConstructorDbRow) ?? null,
        drivers: (drivers.data ?? []) as DriverDbRow[],
      }
    },
  })
}

export function ConstructorSeasonStats({ constructorId }: { constructorId: string }) {
  const team = useConstructor(constructorId)
  const stats = useConstructorSeasonStats(constructorId)
  const standings = useConstructorStandings()
  const standing = (standings.data ?? []).find((s) => s.constructorId === constructorId)

  if (team.isLoading || stats.isLoading)
    return (
      <main className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </main>
    )

  const t = team.data?.team
  const drivers = team.data?.drivers ?? []
  const s = stats.data
  const name = t?.name ?? constructorId
  const color = t?.primary_color ?? '#1f2330'
  const season = s?.season ?? String(new Date().getFullYear())

  return (
    // Page-wide constructor tint — strong at the top, fades to transparent
    // ~70% down so the body's bg-bg takes over for the long tail of a tall
    // page. AppHeader is bg-bg/80 backdrop-blur and naturally picks up the
    // tint through its translucency.
    <main
      className="min-h-screen pb-12"
      style={{
        background: `linear-gradient(180deg, ${color}33 0%, ${color}14 25%, ${color}08 60%, transparent 100%)`,
      }}
    >
      <header className="relative overflow-hidden border-b border-border">
        {/* Radial highlight on the hero band adds a second beat of colour
            on top of the page gradient so the masthead still pops. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background: `radial-gradient(60% 80% at 85% 20%, ${color}66, transparent 70%)`,
          }}
        />
        <div className="relative mx-auto flex max-w-4xl items-center gap-5 px-4 py-8 sm:py-10">
          <ConstructorLogo
            constructorId={constructorId}
            name={name}
            color={color}
            logoUrl={t?.logo_url ?? null}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <Link href={`/team/${constructorId}`} className="text-xs text-muted hover:text-text">
              ← Overview
            </Link>
            <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight text-text sm:text-4xl">
              {name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              {t?.nationality ? <span>{t.nationality}</span> : null}
              {standing ? (
                <>
                  <span>·</span>
                  <span className="text-text">
                    P{standing.position} · {standing.points} pts
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4">
        <ConstructorStandingsTable season={season} name={name} rows={s?.rows ?? []} />
        <StandingsByRoundChart
          constructorId={constructorId}
          constructorName={name}
          season={season}
        />
        <SeasonStatsGrid
          season={season}
          stats={s}
          standingPosition={standing?.position ?? null}
        />
        {drivers.length > 0 ? <DriversSection drivers={drivers} fallbackColor={color} /> : null}
      </div>
    </main>
  )
}

function ConstructorStandingsTable({
  season,
  name,
  rows,
}: {
  season: string
  name: string
  rows: ConstructorGpRow[]
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold uppercase tracking-wide text-text sm:text-2xl">
        {season} {name} Constructor Standings
      </h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">
            No completed races yet this season.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 text-left font-semibold">Grand Prix</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Drivers</th>
                  <th className="px-4 py-3 text-right font-semibold">Pts.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const flag = flagFor(row.country)
                  return (
                    <tr key={row.round} className="border-t border-border align-top">
                      <td className="px-4 py-3 text-text">
                        <span className="inline-flex items-center gap-2">
                          {flag ? <span aria-hidden>{flag}</span> : null}
                          <span>{row.country}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text">{shortDate(row.date)}</td>
                      <td className="px-4 py-3 text-text">
                        <div className="flex flex-col gap-1">
                          {row.drivers.map((d) => (
                            <div
                              key={d.driverId}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span className="font-mono text-text/80">
                                {d.driverCode ?? d.driverName}
                              </span>
                              <span className="text-muted">
                                {positionLabel(d.position, d.status)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-text tabular-nums">
                        {row.totalPoints}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function StandingsByRoundChart({
  constructorId,
  constructorName,
  season,
}: {
  constructorId: string
  constructorName: string
  season: string
}) {
  const q = useConstructorStandingsOverTime(5, [constructorId])
  const rounds = q.data?.rounds ?? []
  const lanes = q.data?.lanes ?? []

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-bold uppercase tracking-wide text-text sm:text-2xl">
        Standings by round
      </h2>
      {q.isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-surface">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : lanes.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          No completed races yet this season.
        </div>
      ) : (
        <PositionChart
          title={`${constructorName} vs. championship leaders`}
          raceLabel={`${season} season`}
          lanes={lanes}
          totalLaps={rounds[rounds.length - 1] ?? 1}
          xTickFormat={(n) => `R${n}`}
        />
      )}
    </section>
  )
}

function SeasonStatsGrid({
  season,
  stats,
  standingPosition,
}: {
  season: string
  stats: ConstructorSeasonStatsT | undefined
  standingPosition: number | null
}) {
  const gp = stats?.gp
  const sprint = stats?.sprint
  const ordinal = standingPosition != null ? formatOrdinal(standingPosition) : '—'

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-xl font-bold uppercase tracking-wide text-text sm:text-2xl">
        {season} Season
      </h2>
      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5">
        <Stat label="Season Position" value={ordinal} large />
        <Stat label="Season Points" value={stats?.seasonPoints ?? 0} large />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-border pt-5">
        <Stat label="Grand Prix Races" value={gp?.races ?? 0} />
        <Stat label="Grand Prix Points" value={gp?.points ?? 0} />
        <Stat label="Grand Prix Wins" value={gp?.wins ?? 0} />
        <Stat label="Grand Prix Podiums" value={gp?.podiums ?? 0} />
        <Stat label="Grand Prix Poles" value={gp?.poles ?? 0} />
        <Stat label="Grand Prix Top 10s" value={gp?.top10s ?? 0} />
        <Stat label="DHL Fastest Laps" value={gp?.fastestLaps ?? '—'} />
        <Stat label="DNFs" value={gp?.dnfs ?? 0} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-border pt-5">
        <Stat label="Sprint Races" value={sprint?.races ?? 0} />
        <Stat label="Sprint Points" value={sprint?.points ?? 0} />
        <Stat label="Sprint Wins" value={sprint?.wins ?? 0} />
        <Stat label="Sprint Podiums" value={sprint?.podiums ?? 0} />
        <Stat label="Sprint Poles" value={sprint?.poles ?? 0} />
        <Stat label="Sprint Top 10s" value={sprint?.top10s ?? 0} />
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  large = false,
}: {
  label: string
  value: number | string
  large?: boolean
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div
        className={
          large
            ? 'mt-1 text-4xl font-bold leading-none text-text tabular-nums'
            : 'mt-1 text-2xl font-bold leading-none text-text tabular-nums'
        }
      >
        {value}
      </div>
    </div>
  )
}

function DriversSection({
  drivers,
  fallbackColor,
}: {
  drivers: DriverDbRow[]
  fallbackColor: string
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-bold uppercase tracking-wide text-text sm:text-2xl">
        Drivers
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {drivers.map((d) => (
          <Link
            key={d.driver_id}
            href={`/driver/${d.driver_id}/stats`}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-text/30"
          >
            <DriverAvatar
              name={`${d.given_name} ${d.family_name}`}
              code={d.code}
              headshotUrl={d.headshot_url}
              accent={d.primary_color ?? fallbackColor}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-text">
                {d.given_name} {d.family_name}
              </div>
              <div className="font-mono text-[10px] text-muted">{d.code ?? ''}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
