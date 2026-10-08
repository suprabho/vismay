'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { DayRow } from '@/lib/calendarRows'
import { TONE_TEXT } from './GameLine'
import { FavStar, LiveDot, TeamBadge } from './ui'

/**
 * The day view's list: games in tip-off order, a NOW rule on today, and a
 * "My teams" switch that narrows to followed teams.
 */
export function DayGames({
  heading,
  isToday,
  rows,
  nowLabel,
  nowAt,
}: {
  heading: string
  isToday: boolean
  rows: DayRow[]
  nowLabel: string
  nowAt: string
}) {
  const [mine, setMine] = useState(false)
  const favCount = rows.filter((r) => r.favLabel).length
  const shown = mine ? rows.filter((r) => r.favLabel) : rows
  const nowIndex = isToday ? shown.findIndex((r) => r.date > nowAt && r.tone === 'up') : -1
  const countLabel = mine
    ? `${favCount} of ${rows.length} games · your teams`
    : `${rows.length} game${rows.length === 1 ? '' : 's'}${favCount ? ` · ${favCount} with your teams` : ''}`

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 py-0.5">
        <div>
          <div className="text-[17px] font-semibold">
            {heading} {isToday && <span className="text-xs font-medium text-accent">· Today</span>}
          </div>
          <div className="text-xs text-muted">{countLabel}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={mine}
          onClick={() => setMine(!mine)}
          className="flex min-h-11 items-center gap-2 rounded-full pr-1 pl-2.5 text-xs font-medium text-soft"
        >
          My teams
          <span
            className={`flex h-[22px] w-[38px] rounded-full p-0.5 transition-colors ${mine ? 'justify-end bg-accent' : 'justify-start bg-border-strong'}`}
          >
            <span className="size-[18px] rounded-full bg-text" />
          </span>
        </button>
      </div>

      <div className="flex flex-col gap-2 px-3 pt-1.5 pb-4">
        {shown.length === 0 && (
          <p className="rounded-[14px] border border-border bg-surface p-4 text-sm text-muted">
            {mine ? 'None of your teams play today.' : 'No games scheduled.'}
          </p>
        )}
        {shown.map((r, i) => (
          <div key={r.id}>
            {i === nowIndex && <NowRule label={nowLabel} />}
            <GameRow row={r} />
          </div>
        ))}
        {isToday && shown.length > 0 && nowIndex === -1 && shown.every((r) => r.tone !== 'up') && (
          <NowRule label={nowLabel} />
        )}
      </div>
    </>
  )
}

function NowRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-[62px] flex-none font-mono text-[11px] font-bold text-accent">{label}</span>
      <span className="h-0.5 flex-1 rounded-sm bg-accent" />
      <span className="text-[10px] font-bold tracking-[0.12em] text-accent">NOW</span>
    </div>
  )
}

function GameRow({ row }: { row: DayRow }) {
  return (
    <div className="flex items-start gap-2">
      <div className={`w-[62px] flex-none pt-3 ${row.tone === 'final' ? 'opacity-55' : ''}`}>
        <div className="font-mono text-[11.5px] font-semibold">{row.time}</div>
        {row.et && <div className="mt-0.5 text-[9.5px] text-muted">{row.et}</div>}
      </div>
      <Link
        href={`/game/${row.id}`}
        className={`flex min-w-0 flex-1 flex-col gap-2 rounded-[14px] border px-3 py-2.5 ${
          row.favLabel ? 'border-accent/50 bg-surface-raised' : 'border-border bg-surface'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className={`flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.07em] ${TONE_TEXT[row.tone]}`}>
            {row.tone === 'live' && <LiveDot />}
            {row.status}
          </span>
          {row.favLabel && (
            <span className="flex items-center gap-1 text-[10.5px] font-semibold text-accent">
              <FavStar size={11} />
              {row.favLabel}
            </span>
          )}
        </div>
        {row.sides.map((s) => (
          <div key={s.team.id} className="flex items-center gap-2">
            <TeamBadge team={s.team} size={26} />
            <span className={`min-w-0 flex-1 truncate text-[14.5px] font-semibold ${s.bright ? 'text-text' : 'text-dim'}`}>
              {s.team.name}
            </span>
            <span
              className={`font-mono ${s.played ? 'text-[17px]' : 'text-[11px]'} ${
                s.played && s.bright ? 'font-bold text-text' : 'font-medium text-muted'
              }`}
            >
              {s.right}
            </span>
          </div>
        ))}
      </Link>
    </div>
  )
}
