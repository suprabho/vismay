'use client'

import type { FixtureEvent, EventTypeFilter } from '../types'

type Props = {
  events: FixtureEvent[]
  /** Empty-state copy shown when there are no events to render. */
  emptyText?: string
  /** Narrow to one event type; 'all' (default) shows goals + cards + subs. */
  filter?: EventTypeFilter
}

// Goals are the headline; cards and subs add texture. `var` rows are usually
// noise on a recap timeline, so we drop them. Order within a minute keeps goals
// first so a goal+booking in the same minute reads goal-then-card.
const RENDERED_TYPES: ReadonlySet<FixtureEvent['type']> = new Set(['goal', 'card', 'subst'])
const TYPE_RANK: Record<string, number> = { goal: 0, subst: 1, card: 2, var: 3 }

function minuteLabel(e: FixtureEvent): string {
  return e.extra_minute != null ? `${e.minute}+${e.extra_minute}'` : `${e.minute}'`
}

function isRedCard(e: FixtureEvent): boolean {
  return e.type === 'card' && /red/i.test(e.detail ?? '')
}

function EventGlyph({ event }: { event: FixtureEvent }) {
  if (event.type === 'goal') {
    // Own goals are visually distinguished so they don't read as the scorer's
    // team's goal.
    const own = /own/i.test(event.detail ?? '')
    return <span aria-hidden className={own ? 'opacity-60' : ''}>⚽</span>
  }
  if (event.type === 'card') {
    const red = isRedCard(event)
    return (
      <span
        aria-hidden
        className={`inline-block h-3 w-[9px] rounded-[1px] ${red ? 'bg-red-500' : 'bg-yellow-400'}`}
      />
    )
  }
  // subst
  return <span aria-hidden className="text-accent">⇄</span>
}

function EventDetail({ event, align }: { event: FixtureEvent; align: 'left' | 'right' }) {
  const alignClass = align === 'right' ? 'items-end text-right' : 'items-start text-left'
  const primary = event.player_name ?? 'Unknown'
  // For goals the assist is the secondary line; for subs it's the player coming
  // on. Penalties/own goals get a small qualifier so the score makes sense.
  const qualifier =
    event.type === 'goal' && event.detail && /penalty|own/i.test(event.detail)
      ? ` (${/own/i.test(event.detail) ? 'OG' : 'pen'})`
      : ''
  const secondary =
    event.type === 'goal' && event.assist_name
      ? `assist: ${event.assist_name}`
      : event.type === 'subst' && event.assist_name
        ? `on: ${event.assist_name}`
        : null

  return (
    <div className={`flex min-w-0 flex-col ${alignClass}`}>
      <span className="truncate text-sm font-medium text-text">
        {primary}
        {qualifier ? <span className="text-muted">{qualifier}</span> : null}
      </span>
      {secondary ? <span className="truncate text-[11px] text-muted">{secondary}</span> : null}
    </div>
  )
}

/**
 * Chronological match timeline: home-side events on the left, away-side on the
 * right, the minute down the middle. Mirrors the home/away split MatchRow uses
 * and styles with the same brand tokens (text/muted/accent/border).
 */
export function MatchTimeline({ events, emptyText = 'No match events recorded.', filter = 'all' }: Props) {
  const rendered = events
    .filter((e) => RENDERED_TYPES.has(e.type) && (filter === 'all' || e.type === filter))
    .slice()
    .sort((a, b) => {
      const am = a.minute + (a.extra_minute ?? 0) / 100
      const bm = b.minute + (b.extra_minute ?? 0) / 100
      if (am !== bm) return am - bm
      return (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9)
    })

  if (rendered.length === 0) {
    return <p className="text-sm text-muted">{emptyText}</p>
  }

  return (
    <ol className="flex flex-col">
      {rendered.map((e) => {
        const onLeft = e.side !== 'away' // home and side-less events sit left
        return (
          <li
            key={e.id}
            className="flex items-center gap-2 border-b border-white/15 py-2 last:border-b-0"
          >
            <div className="flex flex-1 items-center justify-end gap-2">
              {onLeft ? (
                <>
                  <EventDetail event={e} align="right" />
                  <EventGlyph event={e} />
                </>
              ) : null}
            </div>
            <span className="w-12 shrink-0 text-center text-xs tabular-nums text-muted">
              {minuteLabel(e)}
            </span>
            <div className="flex flex-1 items-center gap-2">
              {!onLeft ? (
                <>
                  <EventGlyph event={e} />
                  <EventDetail event={e} align="left" />
                </>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
