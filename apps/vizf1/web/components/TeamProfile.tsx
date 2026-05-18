'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { TeamBadge } from '@/components/TeamBadge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { NewsReelCard } from '@/components/NewsReelCard'
import { useConstructorStandings } from '@/lib/useConstructorStandings'
import { useStorySegments } from '@/lib/useStorySegments'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

type ConstructorDbRow = {
  constructor_id: string
  name: string
  nationality: string | null
  primary_color: string | null
}
type DriverDbRow = {
  driver_id: string
  given_name: string
  family_name: string
  code: string | null
  headshot_url: string | null
  primary_color: string | null
}

function useTeam(teamId: string) {
  return useQuery({
    queryKey: ['vizf1', 'team', teamId],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<{
      team: ConstructorDbRow | null
      drivers: DriverDbRow[]
    }> => {
      const sb = supabaseBrowser()
      const [team, drivers] = await Promise.all([
        sb
          .from('vizf1_constructors')
          .select('constructor_id, name, nationality, primary_color')
          .eq('constructor_id', teamId)
          .maybeSingle(),
        sb
          .from('vizf1_drivers')
          .select('driver_id, given_name, family_name, code, headshot_url, primary_color')
          .eq('constructor_id', teamId),
      ])
      return {
        team: (team.data as ConstructorDbRow) ?? null,
        drivers: (drivers.data ?? []) as DriverDbRow[],
      }
    },
  })
}

export function TeamProfile({ teamId }: { teamId: string }) {
  const team = useTeam(teamId)
  const standings = useConstructorStandings()
  const news = useStorySegments('constructor', teamId)
  const standing = (standings.data ?? []).find((s) => s.constructorId === teamId)

  if (team.isLoading)
    return (
      <main className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </main>
    )
  const t = team.data?.team
  const drivers = team.data?.drivers ?? []
  const name = t?.name ?? teamId
  const color = t?.primary_color ?? null

  return (
    <main className="mx-auto max-w-2xl px-4 py-4 pb-12">
      <Link href="/feed" className="text-xs text-muted hover:text-text">
        ← For You
      </Link>

      <header className="mt-3 flex items-center gap-4">
        <TeamBadge constructorId={teamId} name={name} color={color} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold leading-tight text-text">{name}</h1>
          <p className="text-xs text-muted">{t?.nationality ?? ''}</p>
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

      {drivers.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Drivers
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {drivers.map((d) => (
              <Link
                key={d.driver_id}
                href={`/driver/${d.driver_id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <DriverAvatar
                  name={`${d.given_name} ${d.family_name}`}
                  code={d.code}
                  headshotUrl={d.headshot_url}
                  accent={d.primary_color ?? color}
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
      ) : null}

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
