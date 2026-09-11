'use client'

import type { CSSProperties } from 'react'
import { AirplaneTilt, House } from '@phosphor-icons/react'
import type { FixtureRow } from '../types'
import { Crest } from '../data/Crest'
import { findTeam } from '../data/teams'
import {
  getCompetitionDisplayName,
  getCompetitionPalette,
  getCompetitionShortCode,
} from '../competitionMeta'
import {
  formatCalendarMonth,
  monthGrid,
  refIsTeam,
  teamFixturesInMonth,
  weekdayInitials,
  type TeamFixture,
  type WeekStart,
} from '../teamCalendar'

/**
 * One team's month, as a wall calendar: a 7-column day grid where every match
 * day carries the three things a schedule glance needs —
 *
 *   - competition  → a colored short-code chip ("PL", "UCL", "FAC") in the
 *                    cell's top-right corner, using the competition palette;
 *   - home / away  → a house icon (home) or a plane icon (away) under the
 *                    crest; home days are also filled with the team's brand
 *                    color, away days outlined/dashed;
 *   - opponent     → the opponent's crest (the cell tooltip carries the name).
 *
 * Finished matches also show the score from the team's perspective, colored
 * W / D / L. A legend under the grid decodes the fill/dash convention and every
 * competition that appears in the month.
 *
 * Sizing is container-relative (`cqi`), so the same component reads at the
 * story layer's ~640px and inside a ~280px share-card layer box; the grid just
 * scales. Everything is computed in UTC (see ../teamCalendar.ts).
 */

const HEX6 = /^#[0-9a-fA-F]{6}$/

const RESULT_COLOR: Record<NonNullable<TeamFixture['result']>, string> = {
  W: '#00D26A',
  D: '#8E8E99',
  L: '#EF4444',
}

/** The team's brand hex — from a fixture ref's `primary_color` when a consumer
 *  selected it, else the bundled palette, else undefined (neutral tint). */
function teamBrandColor(fixtures: FixtureRow[], teamId: string): string | undefined {
  for (const f of fixtures) {
    const ref = refIsTeam(f.home, teamId) ? f.home : refIsTeam(f.away, teamId) ? f.away : null
    if (!ref) continue
    if (ref.primary_color && HEX6.test(ref.primary_color)) return ref.primary_color
    const entry = findTeam(ref.slug) ?? findTeam(ref.name)
    if (entry) return entry.color
  }
  return undefined
}

/** `#RRGGBB` + alpha (0–1) → `#RRGGBBAA`. */
function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`
}

/** Translucent `currentColor` — keeps borders/fills theme-aware on light and
 *  dark cards without hardcoding white. */
function ink(alpha: number): string {
  return `color-mix(in srgb, currentColor ${Math.round(alpha * 100)}%, transparent)`
}

// Container-query sizes: a cell is ~1/7 of the container width, so 2.2cqi is
// roughly 15% of a cell — legible at the share card's ~280px and capped so the
// 640px story layer doesn't balloon.
const SIZE = {
  gap: 'clamp(2px, 0.9cqi, 8px)',
  cellPad: 'clamp(2px, 0.9cqi, 6px)',
  cellRadius: 'clamp(3px, 1.2cqi, 10px)',
  day: 'clamp(7px, 2.2cqi, 13px)',
  chip: 'clamp(6px, 1.7cqi, 10px)',
  venue: 'clamp(9px, 2.8cqi, 16px)',
  score: 'clamp(7px, 2.1cqi, 12px)',
  crest: 'clamp(12px, 5.8cqi, 36px)',
  weekday: 'clamp(7px, 2cqi, 11px)',
  legend: 'clamp(7px, 2cqi, 11px)',
  heading: 'clamp(9px, 2.6cqi, 14px)',
} as const

function CompetitionChip({ slug, size }: { slug: string; size: string }) {
  const color = getCompetitionPalette(slug)
  const style: CSSProperties = color
    ? { background: color, color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.22)' }
    : { background: ink(0.14), color: 'inherit', border: `1px solid ${ink(0.2)}` }
  return (
    <span
      title={getCompetitionDisplayName(slug)}
      style={{
        ...style,
        fontSize: size,
        lineHeight: 1,
        fontWeight: 700,
        letterSpacing: '0.04em',
        padding: '0.18em 0.32em',
        borderRadius: '0.3em',
        whiteSpace: 'nowrap',
      }}
    >
      {getCompetitionShortCode(slug)}
    </span>
  )
}

/** Home = house, away = plane. Sized to the surrounding text (1em) so it
 *  scales with the cell; `aria-label` keeps the meaning for screen readers. */
function VenueIcon({ home }: { home: boolean }) {
  const style: CSSProperties = { width: '1.05em', height: '1.05em', flexShrink: 0, opacity: 0.85 }
  return home ? (
    <House weight="fill" style={style} aria-label="Home" />
  ) : (
    <AirplaneTilt weight="fill" style={style} aria-label="Away" />
  )
}

function StatusLine({ tf, showScores }: { tf: TeamFixture; showScores: boolean }) {
  const { fixture, score, result } = tf
  if (fixture.status === 'live') {
    return <span style={{ color: '#00D26A', fontWeight: 700 }}>LIVE</span>
  }
  if (fixture.status === 'postponed') return <span style={{ opacity: 0.6 }}>PPD</span>
  if (fixture.status === 'cancelled') return <span style={{ opacity: 0.6 }}>CXL</span>
  if (showScores && score && result) {
    return (
      <span style={{ color: RESULT_COLOR[result], fontWeight: 700 }}>
        {score[0]}–{score[1]}
      </span>
    )
  }
  return null
}

function DayCell({
  day,
  matches,
  teamColor,
  showScores,
}: {
  day: number | null
  matches: TeamFixture[]
  teamColor?: string
  showScores: boolean
}) {
  const base: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Preferred shape; a grid item's automatic minimum height still lets the
    // cell grow when the four rows (day+chip, crest, venue, score) need more
    // than this at the smallest sizes — the row stretches to its tallest cell.
    aspectRatio: '1 / 1.15',
    padding: SIZE.cellPad,
    borderRadius: SIZE.cellRadius,
    minWidth: 0,
    gap: '0.15em',
    fontSize: SIZE.day,
  }

  // Leading / trailing pad — keep the cell so rows stay aligned, paint nothing.
  if (day === null) return <div style={{ ...base, visibility: 'hidden' }} aria-hidden />

  const first = matches[0]
  if (!first) {
    return (
      <div style={{ ...base, border: `1px solid ${ink(0.08)}`, justifyContent: 'flex-start' }}>
        <span style={{ alignSelf: 'flex-start', fontSize: SIZE.day, lineHeight: 1, opacity: 0.35 }}>
          {day}
        </span>
      </div>
    )
  }

  const { home, opponent, opponentName, fixture } = first
  const tint = teamColor && HEX6.test(teamColor) ? teamColor : undefined
  const homeStyle: CSSProperties = tint
    ? { background: withAlpha(tint, 0.22), border: `1px solid ${withAlpha(tint, 0.7)}` }
    : { background: ink(0.12), border: `1px solid ${ink(0.35)}` }
  const awayStyle: CSSProperties = { background: 'transparent', border: `1px dashed ${ink(0.45)}` }
  const dim = fixture.status === 'postponed' || fixture.status === 'cancelled'

  return (
    <div
      style={{ ...base, ...(home ? homeStyle : awayStyle) }}
      title={`${home ? 'Home vs' : 'Away at'} ${opponentName} · ${getCompetitionDisplayName(fixture.competition_slug)}`}
    >
      <div
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.2em',
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: SIZE.day, lineHeight: 1, fontWeight: 700, opacity: 0.85 }}>
          {day}
          {matches.length > 1 ? (
            <span style={{ fontWeight: 500, opacity: 0.7 }}> +{matches.length - 1}</span>
          ) : null}
        </span>
        <CompetitionChip slug={fixture.competition_slug} size={SIZE.chip} />
      </div>

      <div style={{ opacity: dim ? 0.45 : 1, lineHeight: 0 }}>
        <Crest team={opponentName} crestUrl={opponent?.crest_url ?? undefined} size={SIZE.crest} />
      </div>

      {/* Venue on its own row — the crest above already names the opponent. */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: SIZE.venue,
          lineHeight: 1,
          opacity: dim ? 0.5 : 1,
        }}
      >
        <VenueIcon home={home} />
      </div>

      <div style={{ fontSize: SIZE.score, lineHeight: 1, minHeight: '1em' }}>
        <StatusLine tf={first} showScores={showScores} />
      </div>
    </div>
  )
}

type Props = {
  /** Any fixtures involving the team — other months and other teams' matches
   *  are filtered out here, so a whole-season list is fine. */
  fixtures: FixtureRow[]
  /** The team whose month this is (entity id or slug — both match). */
  teamId: string
  /** `YYYY-MM`. */
  month: string
  /** Heading above the grid. Defaults to the month name, e.g. "October 2026". */
  label?: string
  /** Monday-first (default) or Sunday-first columns. */
  weekStart?: WeekStart
  /** Show finished scores (W/D/L colored) on match days. Defaults to true. */
  showScores?: boolean
  /** Show the home/away + competition legend under the grid. Defaults to true. */
  showLegend?: boolean
  /** Override the home-day tint (`#RRGGBB`). Defaults to the team's brand color. */
  teamColor?: string
}

export function TeamCalendar({
  fixtures,
  teamId,
  month,
  label,
  weekStart = 'mon',
  showScores = true,
  showLegend = true,
  teamColor,
}: Props) {
  const rows = monthGrid(month, weekStart)
  if (rows.length === 0) return null

  const matches = teamFixturesInMonth(fixtures, teamId, month)
  const byDay = new Map<number, TeamFixture[]>()
  for (const m of matches) {
    const list = byDay.get(m.day)
    if (list) list.push(m)
    else byDay.set(m.day, [m])
  }
  const competitions = Array.from(new Set(matches.map((m) => m.fixture.competition_slug)))
  const tint = teamColor ?? teamBrandColor(fixtures, teamId)
  const homeCount = matches.filter((m) => m.home).length

  return (
    <div className="text-text" style={{ containerType: 'inline-size', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '0.5em',
          marginBottom: 'clamp(4px, 1.6cqi, 12px)',
          fontSize: SIZE.heading,
        }}
      >
        <div
          style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.85 }}
        >
          {label ?? formatCalendarMonth(month)}
        </div>
        <div style={{ fontSize: '0.85em', opacity: 0.6, whiteSpace: 'nowrap' }}>
          {matches.length} {matches.length === 1 ? 'match' : 'matches'} · {homeCount}H{' '}
          {matches.length - homeCount}A
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: SIZE.gap,
          marginBottom: SIZE.gap,
        }}
      >
        {weekdayInitials(weekStart).map((d, i) => (
          <div
            key={`${d}-${i}`}
            style={{
              textAlign: 'center',
              fontSize: SIZE.weekday,
              fontWeight: 700,
              letterSpacing: '0.08em',
              opacity: 0.5,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: SIZE.gap,
        }}
      >
        {rows.flatMap((row, r) =>
          row.map((cell, c) => (
            <DayCell
              key={`${r}-${c}`}
              day={cell?.day ?? null}
              matches={cell ? (byDay.get(cell.day) ?? []) : []}
              teamColor={tint}
              showScores={showScores}
            />
          )),
        )}
      </div>

      {showLegend ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'clamp(4px, 1.6cqi, 12px)',
            marginTop: 'clamp(4px, 1.8cqi, 12px)',
            fontSize: SIZE.legend,
            opacity: 0.85,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
            <span
              aria-hidden
              style={{
                width: '1em',
                height: '1em',
                borderRadius: '0.25em',
                background: tint ? withAlpha(tint, 0.22) : ink(0.12),
                border: `1px solid ${tint ? withAlpha(tint, 0.7) : ink(0.35)}`,
              }}
            />
            <VenueIcon home /> home
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
            <span
              aria-hidden
              style={{
                width: '1em',
                height: '1em',
                borderRadius: '0.25em',
                border: `1px dashed ${ink(0.45)}`,
              }}
            />
            <VenueIcon home={false} /> away
          </span>
          {competitions.map((slug) => (
            <span key={slug} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
              <CompetitionChip slug={slug} size={SIZE.chip} />
              {getCompetitionDisplayName(slug)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
