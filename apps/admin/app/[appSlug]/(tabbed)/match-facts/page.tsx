import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { createServerSupabase } from '@/lib/supabaseServer'
import { linkFixtureToTheanalystMatch } from '@vismay/content-source/footshortsData'

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
  theanalyst_match_url: string | null
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
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Status dot: green = scraped, amber = matched but not scraped, neutral = not yet discovered. */
function StatusDot({ entry }: { entry: MatchEntry }) {
  const color = entry.home || entry.away ? 'bg-emerald-500' : entry.fixture.theanalyst_match_id ? 'bg-amber-500' : 'bg-neutral-600'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
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

/**
 * Manually links a fixture to a theanalyst.com match — the "not yet
 * discovered" fallback for when auto-discovery's team-name/date matching
 * misses (an obscure nickname, a fixture outside the 30-day window, etc.).
 * Same three id columns matchDiscovery.ts sets automatically, so the next
 * match-facts cron run scrapes it like any other resolved fixture.
 */
async function linkTheanalystUrlAction(formData: FormData) {
  'use server'
  const appSlug = String(formData.get('appSlug') ?? '')
  const competition = String(formData.get('competition') ?? '')
  const fixtureId = String(formData.get('fixtureId') ?? '')
  const theanalystUrl = String(formData.get('theanalystUrl') ?? '').trim()
  if (!appSlug || !fixtureId) return

  const backTo = `/${appSlug}/match-facts?competition=${encodeURIComponent(competition)}&fixture=${fixtureId}`
  try {
    await linkFixtureToTheanalystMatch(fixtureId, theanalystUrl)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'failed to link'
    redirect(`${backTo}&linkError=${encodeURIComponent(message)}`)
  }
  revalidatePath(`/${appSlug}/match-facts`)
  redirect(backTo)
}

function TheanalystLink({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline">
      View on theanalyst.com ↗
    </a>
  )
}

/** Column 3: full detail for the active fixture — stats, pending state, or the manual-link form. */
function MatchFactsPanel({ entry, appSlug, linkError }: { entry: MatchEntry; appSlug: string; linkError?: string }) {
  const { fixture, home, away, homeName, awayName } = entry
  const hasFacts = home || away
  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
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
          <div className="px-3 py-1.5 border-t border-white/5 text-[11px] text-neutral-600 flex items-center justify-between gap-3">
            <span>Scraped {new Date((home ?? away)!.scraped_at).toLocaleString()}</span>
            <TheanalystLink url={fixture.theanalyst_match_url} />
          </div>
        </>
      ) : fixture.theanalyst_match_id ? (
        <div className="px-3 py-3 text-xs text-neutral-500 flex items-center justify-between gap-3">
          <span>Matched on theanalyst.com — not scraped yet (waits on the per-run scrape budget).</span>
          <TheanalystLink url={fixture.theanalyst_match_url} />
        </div>
      ) : (
        <div className="px-3 py-3">
          <p className="text-xs text-neutral-500 mb-2">Not yet discovered on theanalyst.com.</p>
          {linkError && <p className="text-xs text-amber-400 mb-2">{linkError}</p>}
          <form action={linkTheanalystUrlAction} className="flex items-center gap-2">
            <input type="hidden" name="appSlug" value={appSlug} />
            <input type="hidden" name="competition" value={fixture.competition_slug ?? ''} />
            <input type="hidden" name="fixtureId" value={fixture.id} />
            <input
              type="url"
              name="theanalystUrl"
              placeholder="https://theanalyst.com/opta-football-match-centre?competitionId=…&seasonId=…&matchId=…"
              required
              className="flex-1 bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600"
            />
            <button
              type="submit"
              className="rounded-md bg-white/10 hover:bg-white/15 transition-colors px-3 py-1.5 text-xs text-neutral-200 whitespace-nowrap"
            >
              Link match
            </button>
          </form>
        </div>
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
 *
 * Three-column browse: competitions → matches (grouped by date) → facts for
 * the selected match, all driven by `?competition=&fixture=` so it's plain
 * links/forms, no client JS.
 */
export default async function MatchFactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ appSlug: string }>
  searchParams: Promise<{ competition?: string; fixture?: string; linkError?: string }>
}) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/match-facts`)
  const { competition: competitionParam, fixture: fixtureParam, linkError } = await searchParams

  const supabase = await createServerSupabase()

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data: fixturesData, error: fixturesError } = await supabase
    .from('fixtures')
    .select(
      'id, home_team_id, away_team_id, home_team_name, away_team_name, competition_slug, kickoff_at, theanalyst_match_id, theanalyst_match_url',
    )
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

  // Resolve the active competition: explicit ?competition= wins, else the
  // selected fixture's own competition, else the first one in the list.
  const fixtureFromParam = fixtureParam ? entries.find((e) => e.fixture.id === fixtureParam) : undefined
  const activeCompetition =
    (competitionParam && byCompetition.has(competitionParam) ? competitionParam : undefined) ??
    (fixtureFromParam ? fixtureFromParam.fixture.competition_slug ?? '—' : undefined) ??
    competitions[0]

  const activeByDate = activeCompetition ? byCompetition.get(activeCompetition) : undefined
  const activeDates = activeByDate ? [...activeByDate.keys()].sort((a, b) => (a < b ? 1 : -1)) : []

  // Active fixture: the one from ?fixture= if it belongs to the active
  // competition, else the most recent match in that competition.
  const activeEntry =
    fixtureFromParam && (fixtureFromParam.fixture.competition_slug ?? '—') === activeCompetition
      ? fixtureFromParam
      : activeDates.length > 0
        ? activeByDate!.get(activeDates[0])![0]
        : undefined

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
              defaultValue={activeEntry?.fixture.id ?? ''}
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
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[180px_300px_1fr]">
          {/* Column 1: competitions */}
          <div className="min-h-0 overflow-y-auto border-r border-white/5 py-2">
            {competitions.map((comp) => {
              const active = comp === activeCompetition
              const compEntries = [...byCompetition.get(comp)!.values()].flat()
              const compScraped = compEntries.filter((e) => e.home || e.away).length
              return (
                <a
                  key={comp}
                  href={`/${appSlug}/match-facts?competition=${encodeURIComponent(comp)}`}
                  className={`block px-3 py-2 text-sm border-l-2 transition-colors ${
                    active
                      ? 'border-sky-500 bg-white/[0.04] text-white'
                      : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="truncate">{competitionLabel(comp)}</div>
                  <div className="text-[11px] text-neutral-600">
                    {compScraped}/{compEntries.length} scraped
                  </div>
                </a>
              )
            })}
          </div>

          {/* Column 2: matches in the active competition, grouped by date */}
          <div className="min-h-0 overflow-y-auto border-r border-white/5 py-2">
            {activeDates.map((day) => (
              <div key={day}>
                <h3 className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-neutral-500 sticky top-0 bg-neutral-950/95 backdrop-blur">
                  {dateLabel(day)}
                </h3>
                {activeByDate!.get(day)!.map((entry) => {
                  const active = entry.fixture.id === activeEntry?.fixture.id
                  return (
                    <a
                      key={entry.fixture.id}
                      href={`/${appSlug}/match-facts?competition=${encodeURIComponent(activeCompetition ?? '')}&fixture=${entry.fixture.id}`}
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm border-l-2 transition-colors ${
                        active
                          ? 'border-sky-500 bg-white/[0.04] text-white'
                          : 'border-transparent text-neutral-300 hover:text-white hover:bg-white/[0.02]'
                      }`}
                    >
                      <StatusDot entry={entry} />
                      <span className="truncate">
                        {entry.homeName} <span className="text-neutral-600">v</span> {entry.awayName}
                      </span>
                    </a>
                  )
                })}
              </div>
            ))}
            {activeDates.length === 0 && (
              <p className="px-3 py-2 text-xs text-neutral-500">No matches in this competition.</p>
            )}
          </div>

          {/* Column 3: facts for the active match */}
          <div className="min-h-0 overflow-y-auto p-4">
            {activeEntry ? (
              <MatchFactsPanel entry={activeEntry} appSlug={appSlug} linkError={linkError} />
            ) : (
              <p className="text-sm text-neutral-500">Select a match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
