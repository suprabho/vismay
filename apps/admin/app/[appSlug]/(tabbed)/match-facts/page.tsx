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
  home_team_id: string | null
  away_team_id: string | null
  home_team_name: string | null
  away_team_name: string | null
  competition_slug: string | null
  kickoff_at: string
  theanalyst_match_id: string | null
}

type MatchEntry = {
  fixture: FixtureRow
  home: FactsRow | null
  away: FactsRow | null
  homeName: string
  awayName: string
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

// Familiar-first ordering for the tracked theanalyst competitions
// (apps/footshorts/worker/src/theanalyst/competitions.ts) — anything else
// (untracked competitions that will never get scraped) sorts after, alphabetically.
const COMPETITION_ORDER = ['premier-league', 'primera-division', 'serie-a', 'bundesliga', 'ligue-1', 'champions-league']

const LOOKBACK_DAYS = 30 // mirrors theanalystMatchFacts.ts's own scrape window
const FIXTURE_LIMIT = 300

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

function dateKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function dateLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function StatsTable({ home, away, homeName, awayName }: { home: FactsRow | null; away: FactsRow | null; homeName: string; awayName: string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-neutral-500">
          <th className="text-right font-normal py-1.5 px-3 w-1/3">{homeName}</th>
          <th className="text-center font-normal py-1.5 px-3 w-1/3"></th>
          <th className="text-left font-normal py-1.5 px-3 w-1/3">{awayName}</th>
        </tr>
      </thead>
      <tbody>
        {STAT_ROWS.map((stat) => (
          <tr key={stat.key} className="border-t border-white/5">
            <td className="text-right py-1.5 px-3 text-neutral-200 tabular-nums">
              {fmt(home?.[stat.key] as number | null, stat.suffix)}
            </td>
            <td className="text-center py-1.5 px-3 text-xs text-neutral-500">{stat.label}</td>
            <td className="text-left py-1.5 px-3 text-neutral-200 tabular-nums">
              {fmt(away?.[stat.key] as number | null, stat.suffix)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MatchCard({ entry, backLinkAppSlug }: { entry: MatchEntry; backLinkAppSlug?: string }) {
  const { fixture, home, away, homeName, awayName } = entry
  const hasFacts = home || away
  return (
    <div id={`fixture-${fixture.id}`} className="rounded-lg border border-white/10 overflow-hidden scroll-mt-4">
      <div className="px-3 py-2.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-white">
            {homeName} <span className="text-neutral-500 font-normal">vs</span> {awayName}
          </span>
          <span className="ml-2 text-xs text-neutral-500">{new Date(fixture.kickoff_at).toLocaleDateString()}</span>
        </div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400 whitespace-nowrap">
          {competitionLabel(fixture.competition_slug)}
        </span>
      </div>
      {hasFacts ? (
        <>
          <StatsTable home={home} away={away} homeName={homeName} awayName={awayName} />
          <div className="px-3 py-1.5 border-t border-white/5 text-[11px] text-neutral-600">
            Scraped {new Date((home ?? away)!.scraped_at).toLocaleString()}
          </div>
        </>
      ) : (
        <div className="px-3 py-3 text-xs text-neutral-500">
          {fixture.theanalyst_match_id
            ? 'Matched on theanalyst.com — not scraped yet (waits on the per-run scrape budget).'
            : 'Not yet discovered on theanalyst.com.'}
        </div>
      )}
      {backLinkAppSlug && (
        <a
          href={`/${backLinkAppSlug}/match-facts`}
          className="block px-3 py-1.5 border-t border-white/5 text-[11px] text-neutral-500 hover:text-white transition-colors"
        >
          ← All matches
        </a>
      )}
    </div>
  )
}

/**
 * Read-only view over `opta_match_facts` (theanalyst.com match-centre scrape,
 * apps/footshorts/worker/src/theanalystMatchFacts.ts) joined against the full
 * `fixtures` list so matches still waiting on discovery/scrape show up too,
 * not just ones that already landed in opta_match_facts. No draft/publish
 * lifecycle like Power rankings — both tables are public-read already, this
 * tab just makes them human-browsable instead of requiring a Supabase Studio
 * trip.
 */
export default async function MatchFactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ appSlug: string }>
  searchParams: Promise<{ fixture?: string }>
}) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/match-facts`)
  const { fixture: selectedFixtureId } = await searchParams

  const supabase = await createServerSupabase()

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data: fixturesData, error: fixturesError } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id, home_team_name, away_team_name, competition_slug, kickoff_at, theanalyst_match_id')
    .eq('status', 'finished')
    .gte('kickoff_at', since)
    .order('kickoff_at', { ascending: false })
    .limit(FIXTURE_LIMIT)

  const fixtures = (fixturesData ?? []) as FixtureRow[]

  const teamIds = [...new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]).filter((id): id is string => !!id))]
  const teamNames = new Map<string, string>()
  if (teamIds.length > 0) {
    const { data: entitiesData } = await supabase.from('entities').select('id, name').in('id', teamIds)
    for (const e of (entitiesData ?? []) as Array<{ id: string; name: string }>) teamNames.set(e.id, e.name)
  }

  const factsByFixture = new Map<string, { home: FactsRow | null; away: FactsRow | null }>()
  if (fixtures.length > 0) {
    const { data: factsData } = await supabase
      .from('opta_match_facts')
      .select(
        'fixture_id, side, xg, shots, shots_on_target, possession, passes, pass_accuracy, big_chances, big_chances_missed, corners, fouls, yellow_cards, red_cards, offsides, scraped_at',
      )
      .in(
        'fixture_id',
        fixtures.map((f) => f.id),
      )
    for (const row of (factsData ?? []) as FactsRow[]) {
      const slot = factsByFixture.get(row.fixture_id) ?? { home: null, away: null }
      if (row.side === 'home') slot.home = row
      else slot.away = row
      factsByFixture.set(row.fixture_id, slot)
    }
  }

  const entries: MatchEntry[] = fixtures.map((fixture) => {
    const facts = factsByFixture.get(fixture.id) ?? { home: null, away: null }
    return {
      fixture,
      home: facts.home,
      away: facts.away,
      homeName: (fixture.home_team_id && teamNames.get(fixture.home_team_id)) ?? fixture.home_team_name ?? 'Home',
      awayName: (fixture.away_team_id && teamNames.get(fixture.away_team_id)) ?? fixture.away_team_name ?? 'Away',
    }
  })

  const scrapedCount = entries.filter((e) => e.home || e.away).length
  const selected = selectedFixtureId ? entries.find((e) => e.fixture.id === selectedFixtureId) : null

  // Competition → date (YYYY-MM-DD) → entries, both pre-sorted since `entries`
  // is already kickoff_at-desc from the query.
  const byCompetition = new Map<string, Map<string, MatchEntry[]>>()
  for (const entry of entries) {
    const comp = entry.fixture.competition_slug ?? '—'
    const day = dateKey(entry.fixture.kickoff_at)
    if (!byCompetition.has(comp)) byCompetition.set(comp, new Map())
    const byDate = byCompetition.get(comp)!
    if (!byDate.has(day)) byDate.set(day, [])
    byDate.get(day)!.push(entry)
  }
  const competitions = [...byCompetition.keys()].sort((a, b) => {
    const ai = COMPETITION_ORDER.indexOf(a)
    const bi = COMPETITION_ORDER.indexOf(b)
    if (ai !== -1 || bi !== -1) return (ai === -1 ? COMPETITION_ORDER.length : ai) - (bi === -1 ? COMPETITION_ORDER.length : bi)
    return competitionLabel(a).localeCompare(competitionLabel(b))
  })

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <div className="shrink-0 px-4 py-5 border-b border-white/5 space-y-3">
        <div>
          <h1 className="text-lg font-semibold">Match facts</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Opta match-centre stats scraped from theanalyst.com · {scrapedCount} of {entries.length} finished matches
            (last {LOOKBACK_DAYS}d) scraped
          </p>
        </div>
        {entries.length > 0 && (
          <form method="GET" className="flex items-center gap-2">
            <select
              name="fixture"
              defaultValue={selectedFixtureId ?? ''}
              className="bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-neutral-200 max-w-md"
            >
              <option value="">Jump to a fixture…</option>
              {competitions.map((comp) => (
                <optgroup key={comp} label={competitionLabel(comp)} className="bg-neutral-900">
                  {[...byCompetition.get(comp)!.entries()]
                    .flatMap(([, list]) => list)
                    .map((entry) => (
                      <option key={entry.fixture.id} value={entry.fixture.id}>
                        {new Date(entry.fixture.kickoff_at).toLocaleDateString()} — {entry.homeName} vs {entry.awayName}
                        {entry.home || entry.away ? '' : ' (not scraped)'}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-white/10 hover:bg-white/15 transition-colors px-3 py-1.5 text-sm text-neutral-200"
            >
              Go
            </button>
          </form>
        )}
      </div>

      {fixturesError ? (
        <div className="px-4 py-10 text-sm text-amber-400 text-center">Could not load fixtures: {fixturesError.message}</div>
      ) : entries.length === 0 ? (
        <div className="px-4 py-10 text-sm text-neutral-500 text-center">
          No finished fixtures in the last {LOOKBACK_DAYS} days.
        </div>
      ) : selectedFixtureId ? (
        <div className="p-4">
          {selected ? (
            <MatchCard entry={selected} backLinkAppSlug={appSlug} />
          ) : (
            <div className="text-sm text-neutral-500">
              Fixture not found in the last {LOOKBACK_DAYS} days.{' '}
              <a href={`/${appSlug}/match-facts`} className="text-white hover:underline">
                ← All matches
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-8">
          {competitions.map((comp) => {
            const byDate = byCompetition.get(comp)!
            const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1))
            return (
              <div key={comp}>
                <h2 className="text-sm font-semibold text-white mb-3 sticky top-0 bg-neutral-950/95 backdrop-blur py-1">
                  {competitionLabel(comp)}
                </h2>
                <div className="space-y-5">
                  {dates.map((day) => (
                    <div key={day}>
                      <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{dateLabel(day)}</h3>
                      <div className="space-y-3">
                        {byDate.get(day)!.map((entry) => (
                          <MatchCard key={entry.fixture.id} entry={entry} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
