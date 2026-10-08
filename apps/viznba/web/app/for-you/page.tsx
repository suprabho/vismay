import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from '@phosphor-icons/react/ssr'
import { AutoRefresh } from '@/components/AutoRefresh'
import { CompactRow, FinalCard, FinalMedium, LiveCard, PreviewCard, UpcomingMedium } from '@/components/ForYouCards'
import { gameDetail, gamesByLocalDay, type Game } from '@/lib/espn'
import { getPrefs } from '@/lib/prefs'
import { teamById } from '@/lib/teams'
import { addDays, dayKey, dayRange, ET, todayKey, zoneLabel } from '@/lib/time'

export const metadata: Metadata = { title: 'For you' }
export const dynamic = 'force-dynamic'

const BACK = 5
const AHEAD = 5
const MAX_CARDS = 9

function nearestFirst(games: Game[]): Game[] {
  const now = Date.now()
  const gap = (g: Game) => Math.abs(new Date(g.date).getTime() - now)
  return [...games].sort((a, b) => gap(a) - gap(b))
}

function listNames(names: string[]): string {
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

/** Notes like "Warriors on the 2nd night of a back-to-back". */
function backToBack(game: Game, all: Game[], followed: Set<string>): string[] {
  const day = dayKey(game.date, ET)
  const prev = addDays(day, -1)
  return [game.away, game.home]
    .filter((s) => followed.has(s.team.id))
    .filter((s) =>
      all.some(
        (g) => dayKey(g.date, ET) === prev && (g.home.team.id === s.team.id || g.away.team.id === s.team.id),
      ),
    )
    .map((s) => `${s.team.name} on the 2nd night of a back-to-back`)
}

export default async function ForYouPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const { team: teamParam } = await searchParams
  const { followed, tz } = await getPrefs()
  const today = todayKey(tz)
  const focus = teamParam ? teamById(teamParam) : undefined
  const scope = new Set((focus ? [focus] : followed).map((t) => t.id))
  const followedIds = new Set(followed.map((t) => t.id))
  const ctx = { tz, today, followed: followedIds }

  const byDay = await gamesByLocalDay(dayRange(addDays(today, -BACK), addDays(today, AHEAD)), tz)
  const all = [...byDay.values()].flat()
  const mine = all.filter((g) => scope.has(g.home.team.id) || scope.has(g.away.team.id))
  const live = mine.filter((g) => g.state === 'in')
  const upcoming = mine.filter((g) => g.state === 'pre').sort((a, b) => a.date.localeCompare(b.date))
  const finals = mine.filter((g) => g.state === 'post').sort((a, b) => b.date.localeCompare(a.date))
  const [nextUp, ...laterUp] = upcoming
  const [lastFinal, ...olderFinals] = finals

  const rich = [...live, nextUp, lastFinal, laterUp[0], olderFinals[0]].filter((g): g is Game => !!g)
  const details = new Map(
    await Promise.all(
      rich.map(async (g) => [g.id, await gameDetail(g.id, g.state === 'in' ? 20 : g.state === 'pre' ? 900 : 3600)] as const),
    ),
  )
  const rest = nearestFirst([...laterUp.slice(1), ...olderFinals.slice(1)])

  const cards: React.ReactNode[] = [
    ...live.map((g) => <LiveCard key={g.id} game={g} detail={details.get(g.id) ?? null} ctx={ctx} />),
    nextUp && (
      <PreviewCard
        key={nextUp.id}
        game={nextUp}
        detail={details.get(nextUp.id) ?? null}
        ctx={ctx}
        notes={backToBack(nextUp, all, followedIds)}
      />
    ),
    lastFinal && <FinalCard key={lastFinal.id} game={lastFinal} detail={details.get(lastFinal.id) ?? null} ctx={ctx} />,
    laterUp[0] && <UpcomingMedium key={laterUp[0].id} game={laterUp[0]} ctx={ctx} />,
    olderFinals[0] && (
      <FinalMedium key={olderFinals[0].id} game={olderFinals[0]} detail={details.get(olderFinals[0].id) ?? null} ctx={ctx} />
    ),
    ...rest.map((g) => <CompactRow key={g.id} game={g} ctx={ctx} />),
  ]
    .filter(Boolean)
    .slice(0, MAX_CARDS)

  const todayCount = (byDay.get(today) ?? []).filter(
    (g) => followedIds.has(g.home.team.id) || followedIds.has(g.away.team.id),
  ).length
  const names = (focus ? [focus] : followed).map((t) => t.name)

  return (
    <main className="pb-10">
      {live.length > 0 && <AutoRefresh />}
      <nav aria-label="Your teams" className="no-scrollbar flex gap-3.5 overflow-x-auto px-3 pt-4 pb-2">
        <Link href="/calendar" className="flex w-16 flex-none flex-col items-center gap-1.5">
          <span className="flex size-[58px] items-center justify-center rounded-full border-[2.5px] border-accent">
            <span className="flex size-12 items-center justify-center rounded-full bg-surface font-mono text-[15px] font-bold">
              {todayCount}
            </span>
          </span>
          <span className="text-[11px] font-medium text-muted">Today</span>
        </Link>
        {followed.map((t) => {
          const active = focus?.id === t.id
          return (
            <Link
              key={t.id}
              href={active ? '/for-you' : `/for-you?team=${t.id}`}
              aria-current={active ? 'true' : undefined}
              className="flex w-16 flex-none flex-col items-center gap-1.5"
            >
              <span
                className="flex size-[58px] items-center justify-center rounded-full border-[2.5px]"
                style={{ borderColor: active || !focus ? t.dot : '#2a2f3d' }}
              >
                <span
                  className="flex size-12 items-center justify-center rounded-full text-[13px] font-extrabold wdth-80"
                  style={{ background: t.bg, color: t.fg }}
                >
                  {t.abbr}
                </span>
              </span>
              <span className={`text-[11px] font-medium ${active ? 'text-text' : 'text-muted'}`}>{t.name}</span>
            </Link>
          )
        })}
        <Link href="/teams" className="flex w-16 flex-none flex-col items-center gap-1.5">
          <span className="flex size-[58px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[#3a4050] text-muted">
            <Plus size={22} />
          </span>
          <span className="text-[11px] font-medium text-muted">Follow</span>
        </Link>
      </nav>

      <div className="flex items-baseline justify-between gap-3 px-3 pt-2 pb-3">
        <p className="text-xs text-muted">
          {names.length ? `Games for ${listNames(names)}` : 'Follow a team to see its games'} · times in {zoneLabel(tz)}
        </p>
        <Link href="/teams" className="flex-none text-xs font-semibold text-accent">
          Edit teams
        </Link>
      </div>

      <div className="flex flex-col gap-3 px-3">
        {cards.length ? (
          cards
        ) : (
          <p className="rounded-[18px] border border-border bg-surface p-5 text-sm text-muted">
            {names.length
              ? `No games for your teams between ${BACK} days ago and ${AHEAD} days from now.`
              : 'Pick a few teams and their games will show up here.'}
          </p>
        )}
        <Link
          href="/calendar?view=week"
          className="flex min-h-12 items-center justify-center rounded-[14px] border border-dashed border-border-strong text-[13px] font-semibold text-soft"
        >
          See your teams&apos; week in the calendar →
        </Link>
      </div>
    </main>
  )
}
