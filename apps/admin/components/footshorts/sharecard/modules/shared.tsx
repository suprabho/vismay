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

/** A scoreline as `[home, away]`. */
export type ScorePair = [number, number]

/** Parse "1 - 1" / "1–1" / "2—3" into `[home, away]` non-negative integers, or
 *  null when it isn't two numbers split by a hyphen / en- / em-dash. */
export function parseScorePair(raw: string): ScorePair | null {
  const m = raw.trim().match(/^(\d+)\s*[-–—]\s*(\d+)$/)
  return m ? [Number(m[1]), Number(m[2])] : null
}

export interface ResolvedMatchScore {
  /** Main scoreline, or null when there's nothing to show yet (pre-match, no override). */
  main: ScorePair | null
  /** Penalty shootout, or null when none was supplied. */
  pens: ScorePair | null
}

/**
 * Resolve the display score for a match card, applying an optional hardcoded
 * main-score override and penalty shootout — neither of which we ingest with
 * fixture data, so the author types them in the studio.
 *
 * Throws an author-facing `Error` when the inputs don't form a coherent result,
 * so a nonsensical scoreline surfaces as a visible message instead of being
 * published. The shootout must "add up": both scores are valid numbers, a tie
 * that reaches penalties is level, and the shootout itself has a winner.
 */
export function resolveMatchScore(
  fixture: FixtureRow,
  scoreOverride?: string,
  penalties?: string,
): ResolvedMatchScore {
  const override = scoreOverride?.trim()
  const pensRaw = penalties?.trim()
  const finished =
    fixture.status === 'finished' && fixture.home_score != null && fixture.away_score != null

  // Main score: an explicit override wins; otherwise the fixture's own result
  // (only once finished — a scheduled match has no score to show).
  let main: ScorePair | null = null
  if (override) {
    main = parseScorePair(override)
    if (!main) throw new Error(`Score "${override}" must be two numbers, e.g. "1 - 1".`)
  } else if (finished) {
    main = [fixture.home_score as number, fixture.away_score as number]
  }

  if (!pensRaw) return { main, pens: null }

  // Penalties supplied — the result must add up.
  if (!main) {
    throw new Error('Set the main score before adding a penalty shootout.')
  }
  if (main[0] !== main[1]) {
    throw new Error(`A match decided on penalties must be level — "${main[0]} – ${main[1]}" isn't.`)
  }
  const pens = parseScorePair(pensRaw)
  if (!pens) throw new Error(`Penalties "${pensRaw}" must be two numbers, e.g. "2 - 3".`)
  if (pens[0] === pens[1]) {
    throw new Error(`A penalty shootout can't end level — "${pens[0]} – ${pens[1]}".`)
  }
  return { main, pens }
}

/** Build an `fs:match-card` config from a fixture, carrying real crests (proxied
 *  for clean capture) and brand colors so the editorial card themes itself.
 *  `score` overrides the fixture-derived scoreline (and forces the result label);
 *  pass the full display string including any `(pens …)` note so the card
 *  layouts render the shootout as the "PENS" note via `splitScoreNote`.
 *  `penaltyResult` swaps the "FT" status for "PEN" (shootout decider). */
export function fixtureToMatchCardConfig(
  fixture: FixtureRow,
  layout: MatchCardLayout,
  competition: string,
  score?: string,
  penaltyResult = false,
): MatchCardConfig {
  const finished =
    fixture.status === 'finished' && fixture.home_score != null && fixture.away_score != null
  const resolvedScore =
    score ?? (finished ? `${fixture.home_score}–${fixture.away_score}` : undefined)
  // A shootout-decided tie reads "PEN" instead of "FT".
  const statusLabel = penaltyResult ? 'PEN' : 'FT'
  return {
    type: 'fs:match-card',
    layout,
    home: fixture.home?.name ?? fixture.home_team_name ?? 'TBD',
    away: fixture.away?.name ?? fixture.away_team_name ?? 'TBD',
    score: resolvedScore,
    // An explicit score (override or finished result) reads as full-time. The
    // score/compact/portrait layouts render `kickoff`; horizontal reads `statusLabel`.
    kickoff: resolvedScore ? statusLabel : kickoffLabel(fixture.kickoff_at),
    statusLabel: resolvedScore ? statusLabel : undefined,
    competition,
    competitionSlug: fixture.competition_slug,
    homeColor: fixture.home?.primary_color ?? undefined,
    awayColor: fixture.away?.primary_color ?? undefined,
    homeCrestUrl: fixture.home?.crest_url ? proxiedImage(fixture.home.crest_url) : undefined,
    awayCrestUrl: fixture.away?.crest_url ? proxiedImage(fixture.away.crest_url) : undefined,
  }
}

/** A fixture rendered as the colorful `tile` or an editorial `MatchCard` layout.
 *  `tile` self-sizes; the editorial layouts fill their host's height.
 *  `scoreOverride` (e.g. "1 - 1") and `penalties` (e.g. "2 - 3") are optional
 *  hardcoded values; the shootout shows as the "PENS" sub-line (cards) or an
 *  inline note (tile). Throws via `resolveMatchScore` when they don't add up —
 *  callers validate first and render the message. */
export function MatchStyleCard({
  fixture,
  style,
  competitionName,
  scoreOverride,
  penalties,
}: {
  fixture: FixtureRow
  style: MatchStyle
  competitionName: string
  scoreOverride?: string
  penalties?: string
}) {
  const { main, pens } = resolveMatchScore(fixture, scoreOverride, penalties)
  if (style === 'tile') {
    // The tile has one compact label line, so the shootout sits inline.
    return (
      <MatchTile
        fixture={withProxiedFixtureCrests(fixture)}
        scoreOverride={main ? `${main[0]} – ${main[1]}` : null}
        penaltyNote={pens ? `pens ${pens[0]} – ${pens[1]}` : null}
      />
    )
  }
  const mainStr = main ? `${main[0]}–${main[1]}` : undefined
  // Newline so the score layout stacks the "PENS" label above the shootout
  // score (it renders the note with `white-space: pre-line`).
  const cardNote = pens ? `pens\n${pens[0]} – ${pens[1]}` : null
  const score = mainStr && cardNote ? `${mainStr} (${cardNote})` : mainStr
  const config = fixtureToMatchCardConfig(
    fixture,
    CARD_LAYOUT[style],
    competitionName,
    score,
    pens != null,
  )
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
