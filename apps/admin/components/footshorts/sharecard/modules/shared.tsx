'use client'

import {
  MatchCard,
  MatchTile,
  type MatchCardConfig,
  type MatchCardLayout,
} from '@vismay/footshorts-viz/web'
import type {
  Bracket,
  BracketSlot,
  FixtureRow,
  FixtureTeamRef,
} from '@vismay/footshorts-viz/types'
import {
  OUTPUT_SIZE,
  RENDER_SCALE,
  type AspectRatio,
  type MatchRowVariant,
  type MatchStyle,
} from '../types'

/**
 * Shared rendering helpers for the `fscard:*` share-card modules. Lifted from
 * ShareCardCanvas so each module Component reproduces today's body exactly —
 * including the crest-proxying that keeps html-to-image capture clean (the story
 * `fs:*` modules don't proxy, which is why share cards need their own family).
 */

/** Route a remote image through the same-origin proxy so html-to-image can
 *  rasterize it without a cross-origin taint. */
export function proxiedImage(url: string): string {
  return `/api/footshorts/share/proxy-image?url=${encodeURIComponent(url)}`
}

export function proxyCrest(url: string | null | undefined): string | null {
  return url ? proxiedImage(url) : (url ?? null)
}

/** Clone a fixture with its crest URLs proxied — the viz components (MatchTile /
 *  TeamFormStrip) read `crest_url` directly, so capture taints without this. */
export function withProxiedFixtureCrests(f: FixtureRow): FixtureRow {
  return {
    ...f,
    home: f.home ? { ...f.home, crest_url: proxyCrest(f.home.crest_url) } : f.home,
    away: f.away ? { ...f.away, crest_url: proxyCrest(f.away.crest_url) } : f.away,
  }
}

function proxyTeamRef(ref: FixtureTeamRef): FixtureTeamRef {
  return ref ? { ...ref, crest_url: proxyCrest(ref.crest_url) } : ref
}

function proxySlot(slot: BracketSlot | undefined): BracketSlot | undefined {
  if (!slot || slot.kind !== 'team') return slot
  return { ...slot, team: proxyTeamRef(slot.team) }
}

/** Clone a built bracket with every team crest URL proxied for clean capture —
 *  walks both the fixture-derived team refs and the incomplete-draw slot refs.
 *  Crest resolves the bundled palette flag into `crest_url` at build time, so
 *  proxying here covers the World-Cup flags too. */
export function withProxiedBracketCrests(bracket: Bracket): Bracket {
  return {
    ...bracket,
    rounds: bracket.rounds.map((round) => ({
      ...round,
      ties: round.ties.map((tie) => ({
        ...tie,
        teamA: proxyTeamRef(tie.teamA),
        teamB: proxyTeamRef(tie.teamB),
        slotA: proxySlot(tie.slotA),
        slotB: proxySlot(tie.slotB),
      })),
    })),
  }
}

/** Deterministic UTC kickoff label (no locale dependence) — "Sat · 17:30". */
export function kickoffLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} · ${hh}:${mm}`
}

const CARD_LAYOUT: Record<Exclude<MatchStyle, 'tile'>, MatchCardLayout> = {
  'card-horizontal': 'horizontal',
  'card-portrait': 'portrait',
  'card-score': 'score',
}

/** Build an `fs:match-card` config from a fixture, carrying real crests (proxied
 *  for clean capture) and brand colors so the editorial card themes itself. */
export function fixtureToMatchCardConfig(
  fixture: FixtureRow,
  layout: MatchCardLayout,
  competition: string,
): MatchCardConfig {
  const finished =
    fixture.status === 'finished' && fixture.home_score != null && fixture.away_score != null
  return {
    type: 'fs:match-card',
    layout,
    home: fixture.home?.name ?? fixture.home_team_name ?? 'TBD',
    away: fixture.away?.name ?? fixture.away_team_name ?? 'TBD',
    score: finished ? `${fixture.home_score}–${fixture.away_score}` : undefined,
    kickoff: finished ? 'FT' : kickoffLabel(fixture.kickoff_at),
    competition,
    competitionSlug: fixture.competition_slug,
    homeColor: fixture.home?.primary_color ?? undefined,
    awayColor: fixture.away?.primary_color ?? undefined,
    homeCrestUrl: fixture.home?.crest_url ? proxiedImage(fixture.home.crest_url) : undefined,
    awayCrestUrl: fixture.away?.crest_url ? proxiedImage(fixture.away.crest_url) : undefined,
  }
}

/** A fixture rendered as the colorful `tile` or an editorial `MatchCard` layout.
 *  `tile` self-sizes; the editorial layouts fill their host's height. */
export function MatchStyleCard({
  fixture,
  style,
  competitionName,
}: {
  fixture: FixtureRow
  style: MatchStyle
  competitionName: string
}) {
  if (style === 'tile') {
    return <MatchTile fixture={withProxiedFixtureCrests(fixture)} />
  }
  const config = fixtureToMatchCardConfig(fixture, CARD_LAYOUT[style], competitionName)
  return <MatchCard config={config} />
}

const FIXTURE_ROW_PX: Record<MatchRowVariant, number> = { compact: 44, expanded: 104 }

/** Rows that fit a ratio without clipping the standings table. */
export function maxStandingsRows(ratio: AspectRatio): number {
  if (ratio === '9:16') return 14
  if (ratio === '3:4' || ratio === '4:5') return 12
  if (ratio === '1:1') return 9
  return 7 // 5:4, 4:3 landscape
}

/** Match rows that fit a ratio without overflowing the card body. */
export function maxFixtureRows(ratio: AspectRatio, variant: MatchRowVariant): number {
  const bodyPx = OUTPUT_SIZE[ratio].h * RENDER_SCALE - 100 // header + footer + caption
  return Math.max(1, Math.floor(bodyPx / FIXTURE_ROW_PX[variant]))
}
