import type {
  Bracket,
  BracketRound,
  BracketSlot,
  BracketTie,
  FixtureTeamRef,
} from './types'

/**
 * Normalise a bracket for the *tree* renderers so the draw reads as a real
 * single-elimination tournament:
 *
 *  1. **Complete the structure.** The tree connects feeders to parents purely
 *     positionally — ties `2j` and `2j+1` of one round feed tie `j` of the next.
 *     That only draws every connector if each round has exactly `ceil(prev/2)`
 *     ties. Incomplete drafts (a published Round of 32 with just a stub Round of
 *     16, or a fixture feed that hasn't seeded the later rounds yet) leave most
 *     feeders with no parent, so the connectors look broken/missing. We pad each
 *     round up to its expected size with blank TBD ties so the tree is whole.
 *
 *  2. **Advance the winners.** Once a tie is decided, its winner should appear
 *     in the next round rather than the slot staying "TBD" until a separate
 *     fixture is seeded. We carry each decided winner into the matching slot of
 *     its parent tie (feeder `2j` → slot A, `2j+1` → slot B), but never over a
 *     slot that already holds a confirmed team (authored data / a real fixture
 *     wins). This is purely additive and idempotent: a complete, already-drawn
 *     bracket is returned unchanged.
 *
 * Returns a new bracket; the input is not mutated.
 */
export function advanceBracket(bracket: Bracket | null): Bracket | null {
  if (!bracket) return null

  const rounds: BracketRound[] = bracket.rounds.map((r) => ({
    stage: r.stage,
    ties: r.ties.map((t) => ({ ...t })),
  }))

  // 1) Pad each round up to ceil(prev/2) so every feeder has a parent slot.
  for (let r = 1; r < rounds.length; r++) {
    const expected = Math.ceil(rounds[r - 1]!.ties.length / 2)
    while (rounds[r]!.ties.length < expected) {
      rounds[r]!.ties.push(emptyTie(rounds[r]!.stage, rounds[r]!.ties.length))
    }
  }

  // 2) Carry decided winners forward into their parent tie's matching slot.
  for (let r = 0; r < rounds.length - 1; r++) {
    const next = rounds[r + 1]!
    rounds[r]!.ties.forEach((tie, j) => {
      const winner = winnerOf(tie)
      if (!winner) return
      const parent = next.ties[Math.floor(j / 2)]
      if (!parent) return
      fillSlot(parent, j % 2 === 0 ? 'A' : 'B', winner.team, winner.name)
    })
  }

  return { ...bracket, rounds }
}

function emptyTie(stage: string, idx: number): BracketTie {
  return {
    stage,
    legs: [],
    teamA: null,
    teamB: null,
    teamAName: 'TBD',
    teamBName: 'TBD',
    aggregate: null,
    winnerTeamId: null,
    id: `${stage}-pad-${idx}`,
    slotA: { kind: 'tbd' },
    slotB: { kind: 'tbd' },
  }
}

/** The winning side of a decided tie, or null while it's undecided. */
function winnerOf(tie: BracketTie): { team: FixtureTeamRef; name: string } | null {
  if (!tie.winnerTeamId) return null
  if (tie.teamA?.id === tie.winnerTeamId) return { team: tie.teamA, name: tie.teamAName }
  if (tie.teamB?.id === tie.winnerTeamId) return { team: tie.teamB, name: tie.teamBName }
  return null
}

/** A confirmed team with no aggregate/winner yet — it has only advanced, not played. */
function advancedSlot(team: FixtureTeamRef, name: string): BracketSlot {
  return { kind: 'team', team, name, score: null, winner: false }
}

// The render slots a tie currently carries — explicit slotA/slotB when present
// (static/incomplete path), otherwise synthesised from the team fields (fixture
// path). Mirrors BracketTree's `tieSlots` so both paths stay in lock-step.
function currentSlots(tie: BracketTie): [BracketSlot, BracketSlot] {
  if (tie.slotA && tie.slotB) return [tie.slotA, tie.slotB]
  return [teamSlot(tie.teamA, tie.teamAName), teamSlot(tie.teamB, tie.teamBName)]
}

function teamSlot(team: FixtureTeamRef, name: string): BracketSlot {
  if (team) return { kind: 'team', team, name, score: null, winner: false }
  const label = name?.trim()
  if (label && label.toUpperCase() !== 'TBD') return { kind: 'placeholder', label }
  return { kind: 'tbd' }
}

function slotRef(slot: BracketSlot): FixtureTeamRef {
  return slot.kind === 'team' ? slot.team : null
}

function slotName(slot: BracketSlot): string {
  if (slot.kind === 'team') return slot.name
  if (slot.kind === 'placeholder') return slot.label
  return 'TBD'
}

// Drop an advancing team into one side of a parent tie, keeping slotA/slotB and
// the legacy teamA/teamB/name fields in sync. A slot that already holds a
// confirmed team is left untouched.
function fillSlot(tie: BracketTie, side: 'A' | 'B', team: FixtureTeamRef, name: string): void {
  const [a, b] = currentSlots(tie)
  const target = side === 'A' ? a : b
  if (target.kind === 'team') return

  const filled = advancedSlot(team, name)
  const slotA = side === 'A' ? filled : a
  const slotB = side === 'B' ? filled : b
  tie.slotA = slotA
  tie.slotB = slotB
  tie.teamA = slotRef(slotA)
  tie.teamB = slotRef(slotB)
  tie.teamAName = slotName(slotA)
  tie.teamBName = slotName(slotB)
}
