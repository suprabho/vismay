import type {
  Bracket,
  BracketRound,
  BracketSlot,
  BracketTie,
  FixtureTeamRef,
} from './types'
import { stageRank } from './stageLabel'
import { findTeam, slugify } from './data/teams'

/**
 * Direct authoring path for *incomplete* knockout brackets.
 *
 * `buildBracket` derives a tree from a flat fixture list, which only works once
 * the draw is real — every tie is a pair of confirmed teams. But a bracket is
 * usually published long before that: most Round-of-32 slots are still
 * qualification descriptors ("Winner Group I", "3rd A/C/D/F", "Runner-up K"),
 * and every later round is empty. There are no fixtures to derive that from, so
 * this builder takes the structure verbatim and produces the same `Bracket`
 * model the renderers already consume — except each slot may be a confirmed
 * team, an unresolved placeholder, or fully TBD.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:bracket
 *       layout: tree
 *       title: 'World Cup 26 · Round of 32'
 *       competitionSlug: world-cup
 *       rounds:
 *         - stage: ROUND_OF_32
 *           ties:
 *             - { a: { team: germany }, b: '3rd A/C/D/F' }
 *             - { a: 'Winner Group I', b: '3rd D/F/G/H' }
 *             - { a: { team: south-africa }, b: { team: canada } }
 *             - ...
 *         - stage: ROUND_OF_16
 *           ties: [ {}, {}, {}, {}, {}, {}, {}, {} ]   # all TBD
 *         - { stage: QUARTER_FINALS, ties: [ {}, {}, {}, {} ] }
 *         - { stage: SEMI_FINALS,    ties: [ {}, {} ] }
 *         - { stage: FINAL,          ties: [ {} ] }
 */

/**
 * One slot as written by an author. The shorthands keep YAML terse:
 *   - `null` / omitted  → a blank, fully-unknown slot (TBD)
 *   - a bare string     → a qualification placeholder ("Runner-up K")
 *   - an object         → a confirmed `team`, or an explicit `placeholder`
 */
export type StaticSlotInput =
  | null
  | string
  | {
      /** Team slug or name; resolved against the bundled palette for crest + colours. */
      team?: string
      /** Display name. Defaults to the resolved palette name, else `team`. */
      name?: string
      /** Crest/flag URL override; falls back to the palette, then a monogram. */
      crestUrl?: string | null
      /** Aggregate/score shown beside the team. */
      score?: number | null
      /** Marks this slot as the tie winner (bolded; advances). */
      winner?: boolean
      /** An unresolved qualification descriptor instead of a team. */
      placeholder?: string
    }

export type StaticTieInput = {
  /** Stable id for React keys; defaults to `${stage}-${index}`. */
  id?: string
  a?: StaticSlotInput
  b?: StaticSlotInput
  /** Which side advanced, when you don't carry explicit scores. */
  winner?: 'a' | 'b'
}

export type StaticRoundInput = {
  /** A knockout stage code, e.g. `ROUND_OF_32` (see stageLabel.ts). */
  stage: string
  ties: StaticTieInput[]
}

export interface StaticBracketInput {
  competitionSlug?: string
  season?: string
  rounds: StaticRoundInput[]
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

/** Turn an authored slot into a normalised {@link BracketSlot}. */
function resolveSlot(input: StaticSlotInput | undefined): BracketSlot {
  if (input == null) return { kind: 'tbd' }

  if (typeof input === 'string') {
    const label = input.trim()
    return label ? { kind: 'placeholder', label } : { kind: 'tbd' }
  }

  if (!isObj(input)) return { kind: 'tbd' }

  const placeholder =
    typeof input.placeholder === 'string' ? input.placeholder.trim() : ''
  if (placeholder) return { kind: 'placeholder', label: placeholder }

  const key =
    typeof input.team === 'string' && input.team.trim()
      ? input.team.trim()
      : typeof input.name === 'string' && input.name.trim()
        ? input.name.trim()
        : ''
  if (!key) return { kind: 'tbd' }

  const entry = findTeam(key)
  const slug = slugify(key)
  const name = input.name ?? entry?.name ?? key
  const team: FixtureTeamRef = {
    id: slug,
    slug,
    name,
    crest_url: input.crestUrl ?? entry?.crest ?? null,
    primary_color: entry?.color ?? null,
  }
  return {
    kind: 'team',
    team,
    name,
    score: input.score ?? null,
    winner: input.winner ?? false,
  }
}

function slotRef(slot: BracketSlot): FixtureTeamRef {
  return slot.kind === 'team' ? slot.team : null
}

function slotName(slot: BracketSlot): string {
  if (slot.kind === 'team') return slot.name
  if (slot.kind === 'placeholder') return slot.label
  return 'TBD'
}

function buildTie(stage: string, idx: number, input: StaticTieInput): BracketTie {
  const slotA = resolveSlot(input.a)
  const slotB = resolveSlot(input.b)
  const teamA = slotRef(slotA)
  const teamB = slotRef(slotB)

  const scoreA = slotA.kind === 'team' ? slotA.score ?? null : null
  const scoreB = slotB.kind === 'team' ? slotB.score ?? null : null
  const aggregate = scoreA != null && scoreB != null ? { a: scoreA, b: scoreB } : null

  // Winner precedence: an explicit per-slot `winner`, else the tie-level
  // `winner` side, else inferred from a decisive aggregate. Only teams (not
  // placeholders) can be flagged as advancing.
  let winnerTeamId: string | null = null
  if (slotA.kind === 'team' && slotA.winner) winnerTeamId = teamA?.id ?? null
  else if (slotB.kind === 'team' && slotB.winner) winnerTeamId = teamB?.id ?? null
  else if (input.winner === 'a') winnerTeamId = teamA?.id ?? null
  else if (input.winner === 'b') winnerTeamId = teamB?.id ?? null
  else if (aggregate && aggregate.a !== aggregate.b)
    winnerTeamId = aggregate.a > aggregate.b ? teamA?.id ?? null : teamB?.id ?? null

  return {
    stage,
    legs: [],
    teamA,
    teamB,
    teamAName: slotName(slotA),
    teamBName: slotName(slotB),
    aggregate,
    winnerTeamId,
    id: input.id ?? `${stage}-${idx}`,
    slotA,
    slotB,
  }
}

/**
 * Build a {@link Bracket} from an explicit, authoring-friendly structure.
 * Rounds are kept in the given order but also stable-sorted by knockout rank so
 * an out-of-order YAML still renders outer→inner. Returns null when no rounds
 * carry any ties (nothing to draw).
 */
export function buildStaticBracket(input: StaticBracketInput): Bracket | null {
  const rounds: BracketRound[] = input.rounds
    .filter((r) => Array.isArray(r.ties) && r.ties.length > 0)
    .map((r) => ({
      stage: r.stage,
      ties: r.ties.map((t, i) => buildTie(r.stage, i, t ?? {})),
    }))

  if (rounds.length === 0) return null

  rounds.sort((x, y) => stageRank(x.stage) - stageRank(y.stage))

  return {
    competition_slug: input.competitionSlug ?? 'world-cup',
    season: input.season ?? '',
    rounds,
  }
}
