'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { PositionChart } from '@vismay/f1-viz/web'
import { DriverAvatar } from '@/components/DriverAvatar'
import { TeamBadge } from '@/components/TeamBadge'
import { useDriverStandings } from '@/lib/useStandings'
import { useStandingsOverTime } from '@/lib/useStandingsOverTime'
import {
  useDriverSeasonStats,
  type DriverSeasonStats as DriverSeasonStatsT,
  type GpResultRow,
} from '@/lib/useDriverSeasonStats'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

type DriverRow = {
  driver_id: string
  given_name: string
  family_name: string
  code: string | null
  permanent_number: string | null
  nationality: string | null
  headshot_url: string | null
  constructor_id: string | null
  primary_color: string | null
  constructors: { name: string; logo_url: string | null } | null
}

function useDriver(driverId: string) {
  return useQuery({
    queryKey: ['vizf1', 'driver', driverId],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<DriverRow | null> => {
      const sb = supabaseBrowser()
      const { data, error } = await sb
        .from('vizf1_drivers')
        .select(
          'driver_id, given_name, family_name, code, permanent_number, nationality, headshot_url, constructor_id, primary_color, constructors:vizf1_constructors(name, logo_url)',
        )
        .eq('driver_id', driverId)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as DriverRow) ?? null
    },
  })
}

// Limited F1-calendar mapping. Supabase circuits don't store a country code,
// so we map the few country names that appear on the calendar to ISO-3166
// alpha-2 codes and convert those into regional-indicator emoji flags. Falls
// back to no flag for unknown countries — the table still reads fine.
const COUNTRY_CODES: Record<string, string> = {
  Australia: 'AU',
  Austria: 'AT',
  Azerbaijan: 'AZ',
  Bahrain: 'BH',
  Belgium: 'BE',
  Brazil: 'BR',
  Canada: 'CA',
  China: 'CN',
  France: 'FR',
  Germany: 'DE',
  Hungary: 'HU',
  Italy: 'IT',
  Japan: 'JP',
  Mexico: 'MX',
  Monaco: 'MC',
  Netherlands: 'NL',
  Portugal: 'PT',
  Qatar: 'QA',
  'Saudi Arabia': 'SA',
  Singapore: 'SG',
  Spain: 'ES',
  'United Arab Emirates': 'AE',
  UAE: 'AE',
  'United Kingdom': 'GB',
  UK: 'GB',
  USA: 'US',
  'United States': 'US',
  Miami: 'US',
  'Las Vegas': 'US',
  Vietnam: 'VN',
}

function flagFor(country: string): string {
  const code = COUNTRY_CODES[country]
  if (!code) return ''
  // 0x1F1E6 = 'A' regional-indicator. Each ISO letter maps to its symbol.
  return [...code].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('')
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${day} ${month}`
}

/** Position cell — number when classified, status string (e.g. "DNF") otherwise. */
function positionLabel(row: GpResultRow): string {
  if (row.position != null) return String(row.position)
  if (row.status) {
    // "Retired" / "Accident" all collapse to DNF for the table — match the
    // mock's convention. Keep DSQ / DNS distinct since they're meaningfully
    // different outcomes.
    const s = row.status.toLowerCase()
    if (s.includes('dns')) return 'DNS'
    if (s.includes('dsq') || s.includes('disqual')) return 'DSQ'
    return 'DNF'
  }
  return '—'
}

export function DriverSeasonStats({ driverId }: { driverId: string }) {
  const driver = useDriver(driverId)
  const stats = useDriverSeasonStats(driverId)
  const standings = useDriverStandings()
  const standing = (standings.data ?? []).find((s) => s.driverId === driverId)

  if (driver.isLoading || stats.isLoading)
    return (
      <main className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </main>
    )

  const d = driver.data
  const s = stats.data
  const name = d ? `${d.given_name} ${d.family_name}` : driverId
  const color = d?.primary_color ?? '#1f2330'
  const season = s?.season ?? String(new Date().getFullYear())

  return (
    <main className="pb-12">
      {/* Constructor-tinted hero band */}
      <header
        className="relative overflow-hidden border-b border-border"
        style={{
          background: `linear-gradient(135deg, ${color}33 0%, ${color}11 60%, var(--color-bg) 100%)`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(60% 80% at 85% 20%, ${color}66, transparent 70%)`,
          }}
        />
        <div className="relative mx-auto flex max-w-4xl items-center gap-5 px-4 py-8 sm:py-10">
          <DriverAvatar
            name={name}
            code={d?.code ?? null}
            headshotUrl={d?.headshot_url ?? null}
            accent={color}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <Link href={`/driver/${driverId}`} className="text-xs text-muted hover:text-text">
              ← Overview
            </Link>
            <div className="mt-1 flex items-baseline gap-3">
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-text sm:text-4xl">
                {name}
              </h1>
              {d?.permanent_number ? (
                <span
                  className="text-3xl font-bold tabular-nums sm:text-4xl"
                  style={{ color }}
                >
                  #{d.permanent_number}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              {d?.code ? (
                <span className="rounded bg-surface/80 px-1.5 py-0.5 font-mono text-text/80">
                  {d.code}
                </span>
              ) : null}
              {d?.nationality ? <span>{d.nationality}</span> : null}
              {d?.constructor_id ? (
                <>
                  <span>·</span>
                  <Link href={`/team/${d.constructor_id}`} className="hover:underline">
                    <TeamBadge
                      constructorId={d.constructor_id}
                      name={d.constructors?.name ?? d.constructor_id}
                      color={color}
                      logoUrl={d.constructors?.logo_url ?? null}
                      size="sm"
                      showName
                    />
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4">
        <DriverStandingsTable season={season} name={name} rows={s?.rows ?? []} />
        <StandingsByRoundChart driverId={driverId} driverName={name} season={season} />
        <SeasonStatsGrid season={season} stats={s} standingPosition={standing?.position ?? null} />
      </div>
    </main>
  )
}

/**
 * This driver's championship position after each completed race round, plotted
 * alongside the top-5 leaders for context. If the page's driver is outside the
 * top 5, they're force-included as a sixth lane — otherwise the chart would
 * show only the title fight while leaving the page driver invisible.
 */
function StandingsByRoundChart({
  driverId,
  driverName,
  season,
}: {
  driverId: string
  driverName: string
  season: string
}) {
  const q = useStandingsOverTime(5, [driverId])
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
          title={`${driverName} vs. championship leaders`}
          raceLabel={`${season} season`}
          lanes={lanes}
          totalLaps={rounds[rounds.length - 1] ?? 1}
          xTickFormat={(n) => `R${n}`}
        />
      )}
    </section>
  )
}

function DriverStandingsTable({
  season,
  name,
  rows,
}: {
  season: string
  name: string
  rows: GpResultRow[]
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold uppercase tracking-wide text-text sm:text-2xl">
        {season} {name} Driver Standings
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
                  <th className="px-4 py-3 text-left font-semibold">Team</th>
                  <th className="px-4 py-3 text-left font-semibold">Race Pos.</th>
                  <th className="px-4 py-3 text-right font-semibold">Pts.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const flag = flagFor(row.country)
                  return (
                    <tr key={row.round} className="border-t border-border">
                      <td className="px-4 py-3 text-text">
                        <span className="inline-flex items-center gap-2">
                          {flag ? <span aria-hidden>{flag}</span> : null}
                          <span>{row.country}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text">{shortDate(row.date)}</td>
                      <td className="px-4 py-3 text-text">{row.constructorName || '—'}</td>
                      <td className="px-4 py-3 text-text tabular-nums">{positionLabel(row)}</td>
                      <td className="px-4 py-3 text-right text-text tabular-nums">{row.points}</td>
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

function SeasonStatsGrid({
  season,
  stats,
  standingPosition,
}: {
  season: string
  stats: DriverSeasonStatsT | undefined
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
      <div className="mt-6 border-t border-border pt-5 grid grid-cols-2 gap-x-8 gap-y-5">
        <Stat label="Grand Prix Races" value={gp?.races ?? 0} />
        <Stat label="Grand Prix Points" value={gp?.points ?? 0} />
        <Stat label="Grand Prix Wins" value={gp?.wins ?? 0} />
        <Stat label="Grand Prix Podiums" value={gp?.podiums ?? 0} />
        <Stat label="Grand Prix Poles" value={gp?.poles ?? 0} />
        <Stat label="Grand Prix Top 10s" value={gp?.top10s ?? 0} />
        <Stat label="DHL Fastest Laps" value={gp?.fastestLaps ?? '—'} />
        <Stat label="DNFs" value={gp?.dnfs ?? 0} />
      </div>
      <div className="mt-6 border-t border-border pt-5 grid grid-cols-2 gap-x-8 gap-y-5">
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

function formatOrdinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}
