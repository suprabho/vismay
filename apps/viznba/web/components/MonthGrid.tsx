'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { LineRow } from '@/lib/calendarRows'
import type { Team } from '@/lib/teams'
import { GameLine } from './GameLine'

export type MonthCell = {
  key: string
  day: number
  label: string
  count: number
  inMonth: boolean
  weekend: boolean
  isToday: boolean
  past: boolean
  /** Followed teams playing that day, and whether that game is over. */
  teams: Array<{ team: Team; played: boolean }>
  games: LineRow[]
}

/** The month grid plus a panel for whichever day is tapped. */
export function MonthGrid({
  cells,
  initial,
  followed,
}: {
  cells: MonthCell[]
  initial: string
  followed: Team[]
}) {
  const [sel, setSel] = useState(initial)
  const s = cells.find((c) => c.key === sel) ?? cells[0]

  return (
    <>
      <section aria-label="Month" className="rounded-2xl border border-border bg-surface px-2 py-2.5">
        <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[10.5px] text-muted">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => {
            const active = c.key === sel
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setSel(c.key)}
                aria-pressed={active}
                aria-label={`${c.label}, ${c.count} games${c.teams.length ? `, your teams: ${c.teams.map((t) => t.team.name).join(', ')}` : ''}`}
                className={`flex h-[62px] flex-col items-start justify-between rounded-[10px] border-[1.5px] px-[5px] pt-1.5 pb-[5px] ${
                  active ? 'border-accent' : c.isToday ? 'border-accent/45' : 'border-transparent'
                } ${active ? 'bg-[#1d2230]' : c.weekend ? 'bg-[#181c26]' : 'bg-well'} ${c.inMonth ? '' : 'opacity-40'}`}
              >
                <span
                  className={`text-[13px] leading-none font-bold ${c.isToday ? 'text-accent' : c.past ? 'text-dim' : 'text-text'}`}
                >
                  {c.day}
                </span>
                <span className="flex gap-0.5">
                  {c.teams.map(({ team, played }) => (
                    <span
                      key={team.id}
                      className="size-[7px] rounded-full border-[1.5px]"
                      style={{ borderColor: team.dot, background: played ? team.dot : 'transparent' }}
                    />
                  ))}
                </span>
                <span className="font-mono text-[9px] text-muted">{c.count || ''}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border px-1 pt-2.5 pb-0.5 text-[10.5px] text-muted">
          {followed.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5">
              <span className="size-[7px] rounded-full" style={{ background: t.dot }} />
              {t.abbr}
            </span>
          ))}
          <span>● played · ○ upcoming · number = games that day</span>
        </div>
      </section>

      <section aria-live="polite" className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">
            {s.label}
            {s.isToday && ' · Today'}
          </h2>
          <span className="font-mono text-[11px] text-muted">
            {s.count} game{s.count === 1 ? '' : 's'}
          </span>
        </div>
        {s.games.length ? (
          s.games.map((g) => <GameLine key={g.id} row={g} inset />)
        ) : (
          <p className="text-xs text-faint">No games for your teams</p>
        )}
        <Link
          href={`/calendar?view=day&date=${s.key}`}
          className="flex min-h-11 items-center justify-center rounded-xl border border-border-strong text-[13px] font-semibold"
        >
          Open day →
        </Link>
      </section>
    </>
  )
}
