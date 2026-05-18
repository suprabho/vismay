'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { DriverAvatar } from '@/components/DriverAvatar'
import { TeamBadge } from '@/components/TeamBadge'
import { NewsReelCard } from '@/components/NewsReelCard'
import { useDriverStandings } from '@/lib/useDriverStandings'
import { useStorySegments } from '@/lib/useStorySegments'
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
  constructors: { name: string } | null
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
          'driver_id, given_name, family_name, code, permanent_number, nationality, headshot_url, constructor_id, primary_color, constructors:vizf1_constructors(name)',
        )
        .eq('driver_id', driverId)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as DriverRow) ?? null
    },
  })
}

export function DriverProfile({ driverId }: { driverId: string }) {
  const driver = useDriver(driverId)
  const standings = useDriverStandings()
  const news = useStorySegments('driver', driverId)
  const standing = (standings.data ?? []).find((s) => s.driverId === driverId)

  if (driver.isLoading)
    return (
      <main className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </main>
    )

  const d = driver.data
  const name = d ? `${d.given_name} ${d.family_name}` : driverId

  return (
    <main className="mx-auto max-w-2xl px-4 py-4 pb-12">
      <Link href="/feed" className="text-xs text-muted hover:text-text">
        ← For You
      </Link>

      <header className="mt-3 flex items-center gap-4">
        <DriverAvatar
          name={name}
          code={d?.code ?? null}
          headshotUrl={d?.headshot_url ?? null}
          accent={d?.primary_color ?? null}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold leading-tight text-text">{name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {d?.code ? (
              <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-text/80">
                {d.code}
              </span>
            ) : null}
            {d?.permanent_number ? <span>#{d.permanent_number}</span> : null}
            {d?.nationality ? <span>· {d.nationality}</span> : null}
            {d?.constructor_id ? (
              <Link href={`/team/${d.constructor_id}`} className="hover:underline">
                <TeamBadge
                  constructorId={d.constructor_id}
                  name={d.constructors?.name ?? d.constructor_id}
                  color={d.primary_color ?? null}
                  size="sm"
                  showName
                />
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Current standing
        </h2>
        {standings.isLoading ? (
          <div className="mt-2 text-sm text-muted">Loading…</div>
        ) : standing ? (
          <div className="mt-2 flex items-center gap-4">
            <span className="text-3xl font-semibold text-text">P{standing.position}</span>
            <div className="flex flex-col">
              <span className="text-sm text-text">{standing.points} pts</span>
              <span className="text-xs text-muted">{standing.wins} wins this season</span>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-muted">Not classified.</div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Recent news
        </h2>
        {news.isLoading ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : (news.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
            No tagged news in the last 14 days.
          </div>
        ) : (
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4">
            {(news.data ?? []).map((c) => (
              <div key={c.id} className="h-[55vh] w-[85vw] flex-shrink-0 sm:w-[420px]">
                <NewsReelCard card={c} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
