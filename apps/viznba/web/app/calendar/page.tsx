import type { Metadata } from 'next'
import Link from 'next/link'
import { CaretLeft, CaretRight, Globe } from '@phosphor-icons/react/ssr'
import { AutoRefresh } from '@/components/AutoRefresh'
import { DayGames } from '@/components/DayGames'
import { GameLine } from '@/components/GameLine'
import { MonthGrid, type MonthCell } from '@/components/MonthGrid'
import { TeamBadge } from '@/components/ui'
import { dayRow, involves, lineRow } from '@/lib/calendarRows'
import { gamesByLocalDay, type Game } from '@/lib/espn'
import { getPrefs } from '@/lib/prefs'
import type { Team } from '@/lib/teams'
import {
  addDays,
  addMonths,
  clockTime,
  dayKey,
  dayMonth,
  dayOfMonth,
  dayRange,
  ET,
  isDayKey,
  monthStart,
  monthYear,
  todayKey,
  weekdayLong,
  weekdayShort,
  weekStart,
  zoneLabel,
} from '@/lib/time'

export const metadata: Metadata = { title: 'Calendar' }
export const dynamic = 'force-dynamic'

type View = 'day' | 'week' | 'month'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>
}) {
  const sp = await searchParams
  const view: View = sp.view === 'week' || sp.view === 'month' ? sp.view : 'day'
  const { followed, tz } = await getPrefs()
  const today = todayKey(tz)
  const date = isDayKey(sp.date) ? sp.date : today
  const ids = new Set(followed.map((t) => t.id))

  return (
    <main className="pb-8">
      <div className="flex flex-col gap-3.5 px-3 pt-[18px]">
        <div className="flex items-end justify-between">
          <h1 className="text-[32px] leading-none font-bold tracking-[-0.02em] wdth-75">Calendar</h1>
          <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-[5px] text-[11px] text-muted">
            <Globe size={12} />
            Times in {zoneLabel(tz)}
          </span>
        </div>
        <nav aria-label="Calendar view" className="grid grid-cols-3 rounded-xl border border-border bg-surface p-[3px]">
          {(['day', 'week', 'month'] as const).map((v) => (
            <Link
              key={v}
              href={`/calendar?view=${v}&date=${date}`}
              aria-current={v === view ? 'page' : undefined}
              className={`flex min-h-[38px] items-center justify-center rounded-[9px] text-[13px] capitalize ${
                v === view ? 'bg-text font-semibold text-bg' : 'font-medium text-muted'
              }`}
            >
              {v}
            </Link>
          ))}
        </nav>
      </div>
      {view === 'day' && <DayView date={date} today={today} tz={tz} ids={ids} followed={followed} />}
      {view === 'week' && <WeekView date={date} today={today} tz={tz} ids={ids} followed={followed} />}
      {view === 'month' && <MonthView date={date} today={today} tz={tz} ids={ids} followed={followed} />}
    </main>
  )
}

type ViewProps = { date: string; today: string; tz: string; ids: Set<string>; followed: Team[] }

function teamsPlaying(games: Game[], followed: Team[]): Team[] {
  return followed.filter((t) => games.some((g) => g.home.team.id === t.id || g.away.team.id === t.id))
}

function Stepper({ prev, next, title, sub, unit }: { prev: string; next: string; title: string; sub: string; unit: string }) {
  const btn = 'flex size-11 flex-none items-center justify-center rounded-full border border-border bg-surface'
  return (
    <div className="flex items-center gap-2">
      <Link href={prev} aria-label={`Previous ${unit}`} className={btn}>
        <CaretLeft size={14} weight="bold" />
      </Link>
      <div className="flex-1 text-center">
        <div className="text-[17px] font-semibold">{title}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
      <Link href={next} aria-label={`Next ${unit}`} className={btn}>
        <CaretRight size={14} weight="bold" />
      </Link>
    </div>
  )
}

/* -------------------------------------------------------------------- day */

async function DayView({ date, today, tz, ids, followed }: ViewProps) {
  const start = weekStart(date)
  const days = dayRange(start, addDays(start, 6))
  const tomorrow = addDays(date, 1)
  const byDay = await gamesByLocalDay(days.includes(tomorrow) ? days : [...days, tomorrow], tz)
  const games = byDay.get(date) ?? []
  const nextCount = byDay.get(tomorrow)?.length ?? 0

  return (
    <>
      {games.some((g) => g.state === 'in') && <AutoRefresh />}
      <div className="grid grid-cols-7 gap-1 px-3 pt-3.5 pb-3.5">
        {days.map((d) => {
          const list = byDay.get(d) ?? []
          const sel = d === date
          return (
            <Link
              key={d}
              href={`/calendar?view=day&date=${d}`}
              aria-label={`${weekdayLong(d)} ${dayMonth(d)}, ${list.length} games`}
              aria-current={sel ? 'date' : undefined}
              className={`flex flex-col items-center gap-[3px] rounded-xl border-[1.5px] pt-2 pb-[7px] ${
                sel ? 'border-accent bg-[#1a1f2a]' : 'border-border bg-surface'
              }`}
            >
              <span className={`text-[10.5px] ${sel || d === today ? 'text-accent' : 'text-muted'}`}>{weekdayShort(d)}</span>
              <span className="text-[17px] leading-[1.1] font-bold">{dayOfMonth(d)}</span>
              <span className="font-mono text-[9.5px] text-muted">{list.length} g</span>
              <span className="flex h-[5px] gap-0.5">
                {teamsPlaying(list, followed).map((t) => (
                  <span key={t.id} className="size-[5px] rounded-full" style={{ background: t.dot }} />
                ))}
              </span>
            </Link>
          )
        })}
      </div>
      <DayGames
        heading={`${weekdayLong(date)} ${dayMonth(date)}`}
        isToday={date === today}
        rows={games.map((g) => dayRow(g, tz, ids))}
        nowLabel={clockTime(new Date().toISOString(), tz)}
        nowAt={new Date().toISOString()}
      />
      <div className="px-3">
        <Link
          href={`/calendar?view=day&date=${tomorrow}`}
          className="flex min-h-[52px] items-center justify-between rounded-[14px] border border-border bg-surface px-4"
        >
          <span className="text-[13px] font-semibold">
            {tomorrow === addDays(today, 1) ? 'Tomorrow' : 'Next day'} · {weekdayShort(tomorrow)} {dayMonth(tomorrow)}
          </span>
          <span className="font-mono text-[11px] text-muted">
            {nextCount} game{nextCount === 1 ? '' : 's'} →
          </span>
        </Link>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------- week */

async function WeekView({ date, today, tz, ids, followed }: ViewProps) {
  const start = weekStart(date)
  const days = dayRange(start, addDays(start, 6))
  const byDay = await gamesByLocalDay(days, tz)
  const all = days.flatMap((d) => byDay.get(d) ?? [])
  const mine = all.filter((g) => involves(g, ids))
  const isThisWeek = days.includes(today)
  const end = days[6]
  const title =
    start.slice(5, 7) === end.slice(5, 7)
      ? `${dayOfMonth(start)} – ${dayMonth(end)} ${end.slice(0, 4)}`
      : `${dayMonth(start)} – ${dayMonth(end)} ${end.slice(0, 4)}`
  const peak = Math.max(1, ...days.map((d) => byDay.get(d)?.length ?? 0))

  return (
    <div className="flex flex-col gap-3.5 px-3 pt-3.5">
      {mine.some((g) => g.state === 'in') && <AutoRefresh />}
      <Stepper
        prev={`/calendar?view=week&date=${addDays(start, -7)}`}
        next={`/calendar?view=week&date=${addDays(start, 7)}`}
        title={title}
        sub={`${isThisWeek ? 'This week · ' : ''}${all.length} games · ${mine.length} with your teams`}
        unit="week"
      />

      <section aria-label="Games per day" className="rounded-2xl border border-border bg-surface px-3 pt-3.5 pb-3">
        <div className="grid grid-cols-7 items-end gap-1.5">
          {days.map((d) => {
            const list = byDay.get(d) ?? []
            const colored = list.flatMap((g) => followed.filter((t) => g.home.team.id === t.id || g.away.team.id === t.id).map((t) => t.dot))
            const blocks = list.map((_, i) => colored[i] ?? (d < today ? '#2a2f3d' : '#3a4050'))
            const isToday = d === today
            return (
              <Link
                key={d}
                href={`/calendar?view=day&date=${d}`}
                aria-label={`${weekdayLong(d)} ${dayMonth(d)}, ${list.length} games`}
                className="flex flex-col items-center gap-1.5"
              >
                <span className="font-mono text-[10px] text-muted">{list.length}</span>
                <span className="flex w-full flex-col-reverse justify-start gap-0.5" style={{ height: Math.max(80, peak * 7) }}>
                  {blocks.map((c, i) => (
                    <span key={i} className="h-[5px] flex-none rounded-[2px]" style={{ background: c }} />
                  ))}
                </span>
                <span className={`text-[10.5px] ${isToday ? 'text-accent' : 'text-muted'}`}>{weekdayShort(d)}</span>
                <span
                  className={`flex size-[26px] items-center justify-center rounded-full text-[13px] font-bold ${
                    isToday ? 'bg-accent text-accent-ink' : ''
                  }`}
                >
                  {dayOfMonth(d)}
                </span>
              </Link>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-2.5 text-[11px] text-muted">
          <span>One block = one game</span>
          {followed.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: t.dot }} />
              {t.abbr}
            </span>
          ))}
        </div>
      </section>

      {followed.length > 0 && (
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
          {followed.map((t) => {
            const games = mine.filter((g) => g.home.team.id === t.id || g.away.team.id === t.id)
            let w = 0
            let l = 0
            for (const g of games.filter((x) => x.state === 'post')) {
              const me = g.home.team.id === t.id ? g.home : g.away
              if (me.winner) w++
              else l++
            }
            const left = games.filter((g) => g.state === 'pre').length
            const live = games.filter((g) => g.state === 'in').length
            const b2b = games.some((g, i) => i > 0 && addDays(dayKey(games[i - 1].date, ET), 1) === dayKey(g.date, ET))
            const note = live ? `${live} live` : b2b ? 'B2B' : left ? `${left} left` : games.length ? 'done' : 'off'
            return (
              <div
                key={t.id}
                className="min-w-[calc((100%-16px)/3)] flex-1 rounded-[14px] border bg-surface p-2.5"
                style={{ borderColor: `color-mix(in srgb, ${t.dot} 35%, transparent)` }}
              >
                <div className="flex items-center gap-1.5">
                  <TeamBadge team={t} size={22} outlined={false} />
                  <span className="truncate text-xs font-semibold">{t.name}</span>
                </div>
                <div className="mt-2 font-mono text-[15px] font-bold">
                  {w}–{l}
                </div>
                <div className="text-[10.5px] text-muted">
                  {games.length} game{games.length === 1 ? '' : 's'} · {note}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-col">
        {days.map((d) => {
          const list = (byDay.get(d) ?? []).filter((g) => involves(g, ids))
          const total = byDay.get(d)?.length ?? 0
          return (
            <section key={d} aria-label={`${weekdayLong(d)} ${dayMonth(d)}`} className="flex flex-col gap-2 border-b border-[#1a1e28] py-3.5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold">
                  {weekdayShort(d)} {dayMonth(d)} {d === today && <span className="text-xs text-accent">· Today</span>}
                </h2>
                <Link href={`/calendar?view=day&date=${d}`} className="flex min-h-8 items-center font-mono text-[10.5px] text-muted">
                  All {total} games →
                </Link>
              </div>
              {list.length === 0 ? (
                <p className="text-xs text-faint">No games for your teams</p>
              ) : (
                list.map((g) => <GameLine key={g.id} row={lineRow(g, tz)} />)
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ month */

async function MonthView({ date, today, tz, ids, followed }: ViewProps) {
  const first = monthStart(date)
  const gridStart = weekStart(first)
  const days = dayRange(gridStart, addDays(gridStart, 41))
  const byDay = await gamesByLocalDay(days, tz)
  const month = first.slice(0, 7)
  const inMonth = days.filter((d) => d.startsWith(month))
  const monthGames = inMonth.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0)
  const perTeam = followed.map((t) => {
    const n = inMonth.reduce(
      (acc, d) => acc + (byDay.get(d) ?? []).filter((g) => g.home.team.id === t.id || g.away.team.id === t.id).length,
      0,
    )
    return `${t.abbr} ${n}`
  })

  const cells: MonthCell[] = days.map((d) => {
    const list = byDay.get(d) ?? []
    const dow = (days.indexOf(d) % 7) as number
    return {
      key: d,
      day: dayOfMonth(d),
      label: `${weekdayShort(d)} ${dayMonth(d)}`,
      count: list.length,
      inMonth: d.startsWith(month),
      weekend: dow >= 5,
      isToday: d === today,
      past: d < today,
      teams: teamsPlaying(list, followed).map((team) => ({
        team,
        played: list.some(
          (g) => g.state === 'post' && (g.home.team.id === team.id || g.away.team.id === team.id),
        ),
      })),
      games: list.filter((g) => involves(g, ids)).map((g) => lineRow(g, tz)),
    }
  })

  const initial = date.startsWith(month) ? date : today.startsWith(month) ? today : first

  return (
    <div className="flex flex-col gap-3.5 px-3 pt-3.5">
      <Stepper
        prev={`/calendar?view=month&date=${addMonths(first, -1)}`}
        next={`/calendar?view=month&date=${addMonths(first, 1)}`}
        title={monthYear(first)}
        sub={[`${monthGames} games`, ...perTeam].join(' · ')}
        unit="month"
      />
      <MonthGrid key={month} cells={cells} initial={initial} followed={followed} />
    </div>
  )
}
