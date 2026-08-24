import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { createServerSupabase } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

type FactsRow = {
  fixture_id: string
  side: 'home' | 'away'
  xg: number | null
  shots: number | null
  shots_on_target: number | null
  possession: number | null
  passes: number | null
  pass_accuracy: number | null
  big_chances: number | null
  big_chances_missed: number | null
  corners: number | null
  fouls: number | null
  yellow_cards: number | null
  red_cards: number | null
  offsides: number | null
  scraped_at: string
}

type FixtureRow = {
  id: string
  home_team_name: string | null
  away_team_name: string | null
  competition_slug: string | null
  kickoff_at: string
}

type MatchGroup = {
  fixtureId: string
  home: FactsRow | null
  away: FactsRow | null
  scrapedAt: string
  fixture: FixtureRow | null
}

const STAT_ROWS: Array<{ key: keyof FactsRow; label: string; suffix?: string }> = [
  { key: 'xg', label: 'xG' },
  { key: 'shots', label: 'Shots' },
  { key: 'shots_on_target', label: 'Shots on target' },
  { key: 'possession', label: 'Possession', suffix: '%' },
  { key: 'passes', label: 'Passes' },
  { key: 'pass_accuracy', label: 'Pass accuracy', suffix: '%' },
  { key: 'big_chances', label: 'Big chances' },
  { key: 'big_chances_missed', label: 'Big chances missed' },
  { key: 'corners', label: 'Corners' },
  { key: 'fouls', label: 'Fouls' },
  { key: 'yellow_cards', label: 'Yellow cards' },
  { key: 'red_cards', label: 'Red cards' },
  { key: 'offsides', label: 'Offsides' },
]

function competitionLabel(slug: string | null): string {
  if (!slug) return 'Unknown competition'
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function fmt(v: number | null, suffix?: string): string {
  if (v === null || v === undefined) return '—'
  return suffix ? `${v}${suffix}` : String(v)
}

/**
 * Read-only view over `opta_match_facts` (theanalyst.com match-centre scrape,
 * apps/footshorts/worker/src/theanalystMatchFacts.ts). No draft/publish
 * lifecycle like Power rankings — the table is public-read already, this tab
 * just makes it human-browsable instead of requiring a Supabase Studio trip.
 */
export default async function MatchFactsPage({
  params,
}: {
  params: Promise<{ appSlug: string }>
}) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/match-facts`)

  const supabase = await createServerSupabase()

  const { data: factsData, error: factsError } = await supabase
    .from('opta_match_facts')
    .select(
      'fixture_id, side, xg, shots, shots_on_target, possession, passes, pass_accuracy, big_chances, big_chances_missed, corners, fouls, yellow_cards, red_cards, offsides, scraped_at',
    )
    .order('scraped_at', { ascending: false })
    .limit(200)

  const facts = (factsData ?? []) as FactsRow[]

  const groupsById = new Map<string, MatchGroup>()
  for (const row of facts) {
    let g = groupsById.get(row.fixture_id)
    if (!g) {
      g = { fixtureId: row.fixture_id, home: null, away: null, scrapedAt: row.scraped_at, fixture: null }
      groupsById.set(row.fixture_id, g)
    }
    if (row.side === 'home') g.home = row
    else g.away = row
    if (row.scraped_at > g.scrapedAt) g.scrapedAt = row.scraped_at
  }

  const groups = [...groupsById.values()].sort((a, b) => (a.scrapedAt < b.scrapedAt ? 1 : -1)).slice(0, 30)

  const fixtureIds = groups.map((g) => g.fixtureId)
  if (fixtureIds.length > 0) {
    const { data: fixturesData } = await supabase
      .from('fixtures')
      .select('id, home_team_name, away_team_name, competition_slug, kickoff_at')
      .in('id', fixtureIds)
    const fixturesById = new Map(((fixturesData ?? []) as FixtureRow[]).map((f) => [f.id, f]))
    for (const g of groups) g.fixture = fixturesById.get(g.fixtureId) ?? null
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <div className="shrink-0 px-4 py-5 border-b border-white/5">
        <h1 className="text-lg font-semibold">Match facts</h1>
        <p className="text-sm text-neutral-400 mt-0.5">
          Opta match-centre stats scraped from theanalyst.com · {groups.length} match
          {groups.length === 1 ? '' : 'es'}
        </p>
      </div>

      {factsError ? (
        <div className="px-4 py-10 text-sm text-amber-400 text-center">
          Could not load match facts: {factsError.message}
        </div>
      ) : groups.length === 0 ? (
        <div className="px-4 py-10 text-sm text-neutral-500 text-center">
          No match facts yet. The worker scrapes finished fixtures automatically every 3 hours,
          or run <code className="font-mono text-neutral-400">pnpm match-facts</code> in the
          footshorts worker.
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {groups.map((g) => {
            const home = g.fixture?.home_team_name ?? 'Home'
            const away = g.fixture?.away_team_name ?? 'Away'
            return (
              <div key={g.fixtureId} className="rounded-lg border border-white/10 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
                  <div>
                    <span className="text-sm font-semibold text-white">
                      {home} <span className="text-neutral-500 font-normal">vs</span> {away}
                    </span>
                    {g.fixture?.kickoff_at ? (
                      <span className="ml-2 text-xs text-neutral-500">
                        {new Date(g.fixture.kickoff_at).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400 whitespace-nowrap">
                    {competitionLabel(g.fixture?.competition_slug ?? null)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-neutral-500">
                      <th className="text-right font-normal py-1.5 px-3 w-1/3">{home}</th>
                      <th className="text-center font-normal py-1.5 px-3 w-1/3"></th>
                      <th className="text-left font-normal py-1.5 px-3 w-1/3">{away}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAT_ROWS.map((stat) => (
                      <tr key={stat.key} className="border-t border-white/5">
                        <td className="text-right py-1.5 px-3 text-neutral-200 tabular-nums">
                          {fmt(g.home?.[stat.key] as number | null, stat.suffix)}
                        </td>
                        <td className="text-center py-1.5 px-3 text-xs text-neutral-500">{stat.label}</td>
                        <td className="text-left py-1.5 px-3 text-neutral-200 tabular-nums">
                          {fmt(g.away?.[stat.key] as number | null, stat.suffix)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-1.5 border-t border-white/5 text-[11px] text-neutral-600">
                  Scraped {new Date(g.scrapedAt).toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
