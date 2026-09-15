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
 *   - competition  → the cell is tinted with the competition's brand color and
 *                    carries its logo (when `competitionLogos` has one for the
 *                    slug — the league entity's `crest_url`) or, failing that,
 *                    its short code ("PL", "LAL", "UCL") as a faint watermark
 *                    behind the crest;
 *   - home / away  → a house icon (home) or a plane icon (away) in the cell's
 *                    top-right corner; home days also get a ring in the team's
 *                    brand color;
 *   - opponent     → the opponent's crest, large and centered (the cell
 *                    tooltip carries the name).
 *
 * Finished matches also show the score from the team's perspective as a pill
 * under the crest, colored W / D / L. A legend under the grid decodes the venue
 * icons and every competition that appears in the month.
 *
 * Every cell — empty, padding or match day — is a fixed-ratio size container
 * (`container-type: size` + `aspect-ratio`), so a busy match day can never
 * stretch its row: all cells in the month are exactly the same height, and the
 * content inside scales with the cell via `cqw` units. The calendar itself is
 * container-relative (`cqi`) too, so the same component reads at the story
 * layer's ~640px and inside a ~280px share-card layer box. Everything is
 * computed in UTC (see ../teamCalendar.ts).
 */

const HEX6 = /^#[0-9a-fA-F]{6}$/

const RESULT_COLOR: Record<NonNullable<TeamFixture['result']>, string> = {
  W: '#00D26A',
  D: '#8E8E99',
  L: '#EF4444',
}

/** Text color on a result pill — dark on the bright green/grey, white on red. */
const RESULT_INK: Record<NonNullable<TeamFixture['result']>, string> = {
  W: '#0B1220',
  D: '#0B1220',
  L: '#FFFFFF',
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

// Calendar-level container-query sizes (`cqi` = % of the calendar's width):
// legible at the share card's ~280px and capped so the 640px story layer
// doesn't balloon.
const SIZE = {
  gap: 'clamp(2px, 0.9cqi, 8px)',
  chip: 'clamp(6px, 1.7cqi, 10px)',
  weekday: 'clamp(7px, 2cqi, 11px)',
  legend: 'clamp(7px, 2cqi, 11px)',
  heading: 'clamp(9px, 2.6cqi, 14px)',
} as const

// Cell-level sizes. Each day cell is its own size container (see DayCell), so
// `cqw` here is a percentage of the *cell's* width, not the calendar's. The
// cell is ~1/7 of the calendar, so 16cqw ≈ 2.2cqi of the calendar-relative
// scale. Vertical budget at aspect 1/1.2 (cell height = 120cqw): padding 2×6 +
// day row 18 + crest 44 + score pill ~19 + two gaps ≈ 99cqw, so the stack
// always fits without pushing the cell taller (the px minimums are chosen so
// it still fits at the ~38px cells of a 280px share card).
//
// `pad`, `radius` and `gap` are set on the cell box *itself*, and an element
// can't query its own container — those resolve against the calendar, so they
// stay on the `cqi` scale.
const CELL = {
  aspect: '1 / 1.2',
  pad: 'clamp(2px, 0.9cqi, 6px)',
  radius: 'clamp(3px, 1.2cqi, 10px)',
  gap: 'clamp(1px, 0.4cqi, 4px)',
  day: 'clamp(7px, 16cqw, 15px)',
  venue: 'clamp(8px, 18cqw, 17px)',
  crest: 'clamp(12px, 44cqw, 42px)',
  score: 'clamp(7px, 14cqw, 13px)',
  watermark: 'clamp(16px, 64cqw, 60px)',
  watermarkLogo: 'clamp(20px, 86cqw, 84px)',
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
  const style: CSSProperties = { width: '1.05em', height: '1.05em', flexShrink: 0 }
  return home ? (
    <House weight="fill" style={style} aria-label="Home" />
  ) : (
    <AirplaneTilt weight="fill" style={style} aria-label="Away" />
  )
}

/** Bottom-of-cell pill: the score (W/D/L colored) or a status word. */
function StatusPill({ tf, showScores }: { tf: TeamFixture; showScores: boolean }) {
  const { fixture, score, result } = tf
  const pill: CSSProperties = {
    display: 'inline-block',
    fontSize: CELL.score,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '0.02em',
    padding: '0.25em 0.6em',
    borderRadius: '0.4em',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
  if (fixture.status === 'live') {
    return <span style={{ ...pill, background: '#00D26A', color: '#0B1220' }}>LIVE</span>
  }
  if (fixture.status === 'postponed' || fixture.status === 'cancelled') {
    return (
      <span style={{ ...pill, background: ink(0.1), color: 'inherit', opacity: 0.7 }}>
        {fixture.status === 'postponed' ? 'PPD' : 'CXL'}
      </span>
    )
  }
  if (showScores && score && result) {
    return (
      <span style={{ ...pill, background: RESULT_COLOR[result], color: RESULT_INK[result] }}>
        {score[0]}-{score[1]}
      </span>
    )
  }
  return null
}

/** Faint competition mark behind the cell content: the logo image when one is
 *  known, else the short code in the competition color. Clipped by the cell. */
function CompetitionWatermark({ slug, logoUrl }: { slug: string; logoUrl?: string }) {
  const compColor = getCompetitionPalette(slug)
  const base: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '54%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    userSelect: 'none',
  }
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        style={{
          ...base,
          width: CELL.watermarkLogo,
          height: CELL.watermarkLogo,
          objectFit: 'contain',
          opacity: 0.22,
        }}
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{
        ...base,
        fontSize: CELL.watermark,
        lineHeight: 1,
        fontWeight: 900,
        letterSpacing: '-0.04em',
        whiteSpace: 'nowrap',
        color: compColor ?? 'currentColor',
        opacity: compColor ? 0.16 : 0.08,
      }}
    >
      {getCompetitionShortCode(slug)}
    </span>
  )
}

function DayCell({
  day,
  matches,
  teamColor,
  showScores,
  competitionLogos,
}: {
  day: number | null
  matches: TeamFixture[]
  teamColor?: string
  showScores: boolean
  competitionLogos?: Record<string, string>
}) {
  const base: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: CELL.gap,
    // Fixed shape, and *size containment*: the cell's box is computed as if it
    // had no content, so a match day (crest + pill) can never grow taller than
    // an empty day — every row in the month ends up the same height. Size
    // containment also makes the cell a container, so the CELL tokens' `cqw`
    // resolve against this cell.
    aspectRatio: CELL.aspect,
    containerType: 'size',
    overflow: 'hidden',
    boxSizing: 'border-box',
    padding: CELL.pad,
    borderRadius: CELL.radius,
    minWidth: 0,
    minHeight: 0,
    fontSize: CELL.day,
  }

  // Leading / trailing pad — keep the cell so rows stay aligned, paint nothing.
  if (day === null) return <div style={{ ...base, visibility: 'hidden' }} aria-hidden />

  const first = matches[0]
  if (!first) {
    return (
      <div style={{ ...base, border: `1px solid ${ink(0.08)}`, justifyContent: 'flex-start' }}>
        <span style={{ alignSelf: 'flex-start', fontSize: CELL.day, lineHeight: 1, opacity: 0.35 }}>
          {day}
        </span>
      </div>
    )
  }

  const { home, opponent, opponentName, fixture } = first
  const compColor = getCompetitionPalette(fixture.competition_slug)
  const tint = teamColor && HEX6.test(teamColor) ? teamColor : undefined
  const dim = fixture.status === 'postponed' || fixture.status === 'cancelled'

  return (
    <div
      style={{
        ...base,
        // Competition-tinted card; home days add a ring in the team color
        // (inset shadow so it never nudges the fixed box).
        background: compColor ? withAlpha(compColor, 0.16) : ink(0.1),
        boxShadow: home && tint ? `inset 0 0 0 1.5px ${withAlpha(tint, 0.85)}` : undefined,
        border: home && !tint ? `1px solid ${ink(0.35)}` : undefined,
      }}
      title={`${home ? 'Home vs' : 'Away at'} ${opponentName} · ${getCompetitionDisplayName(fixture.competition_slug)}`}
    >
      <CompetitionWatermark
        slug={fixture.competition_slug}
        logoUrl={competitionLogos?.[fixture.competition_slug]}
      />

      {/* Row 1: day number (left) · venue icon (right). */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.2em',
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: CELL.day, lineHeight: 1, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {day}
          {matches.length > 1 ? (
            <span style={{ fontWeight: 500, opacity: 0.7 }}> +{matches.length - 1}</span>
          ) : null}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: CELL.venue,
            lineHeight: 1,
            opacity: dim ? 0.5 : 1,
          }}
        >
          <VenueIcon home={home} />
        </span>
      </div>

      {/* Row 2: the opponent's crest, large and centered. */}
      <div style={{ position: 'relative', opacity: dim ? 0.45 : 1, lineHeight: 0 }}>
        <Crest team={opponentName} crestUrl={opponent?.crest_url ?? undefined} size={CELL.crest} />
      </div>

      {/* Row 3: score / status pill. Reserve the line even when empty so the
          crest sits at the same height on every match day. */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          maxWidth: '100%',
          fontSize: CELL.score,
          lineHeight: 1,
          minHeight: '1.5em',
        }}
      >
        <StatusPill tf={first} showScores={showScores} />
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
  /** Override the home-day ring color (`#RRGGBB`). Defaults to the team's brand color. */
  teamColor?: string
  /** Competition slug → logo URL (the league entity's `crest_url`). A match
   *  day whose competition has a logo here shows it as the cell watermark
   *  instead of the short code. */
  competitionLogos?: Record<string, string>
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
  competitionLogos,
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
              competitionLogos={competitionLogos}
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
                boxShadow: `inset 0 0 0 1.5px ${tint ? withAlpha(tint, 0.85) : ink(0.35)}`,
              }}
            />
            <VenueIcon home /> home
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
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
