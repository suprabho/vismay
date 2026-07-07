/**
 * football-data.org stage codes → human labels. Anything unmapped falls back
 * to title-cased words ("ROUND_OF_32" → "Round Of 32") so new stages don't
 * crash the UI even if we forget to extend this map.
 */
const STAGE_LABELS: Record<string, string> = {
  PRELIMINARY_ROUND: 'Preliminary Round',
  FIRST_QUALIFYING_ROUND: '1st Qualifying Round',
  SECOND_QUALIFYING_ROUND: '2nd Qualifying Round',
  THIRD_QUALIFYING_ROUND: '3rd Qualifying Round',
  PLAY_OFFS: 'Play-offs',
  PLAY_OFF_ROUND: 'Play-off Round',
  GROUP_STAGE: 'Group Stage',
  LEAGUE_STAGE: 'League Phase',
  LAST_64: 'Round of 64',
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  ROUND_OF_16: 'Round of 16',
  ROUND_OF_32: 'Round of 32',
  QUARTER_FINALS: 'Quarter-finals',
  SEMI_FINALS: 'Semi-finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
}

export function stageLabel(stage: string): string {
  if (STAGE_LABELS[stage]) return STAGE_LABELS[stage]!
  return stage
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Canonical earliest → latest ordering for knockout stages. Used by
// buildBracket to order rounds, and to decide what "current round" means
// when a competition has fixtures across multiple stages.
const STAGE_ORDER: string[] = [
  'PRELIMINARY_ROUND',
  'FIRST_QUALIFYING_ROUND',
  'SECOND_QUALIFYING_ROUND',
  'THIRD_QUALIFYING_ROUND',
  'PLAY_OFFS',
  'PLAY_OFF_ROUND',
  'GROUP_STAGE',
  'LEAGUE_STAGE',
  'LAST_64',
  'ROUND_OF_32',
  'LAST_32',
  'ROUND_OF_16',
  'LAST_64',
  'LAST_32',
  'LAST_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
]

export function stageRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage)
  // Unknown stages sort to the end so they don't break ordering of known ones.
  return i === -1 ? STAGE_ORDER.length : i
}

// Stages that represent a single knockout round. Allowlist (not a deny-list of
// 'GROUP_STAGE'/'LEAGUE_STAGE'/'REGULAR_SEASON'/etc) so that football-data.org
// values we haven't seen yet don't get mis-classified as knockouts.
const KNOCKOUT_STAGES = new Set<string>([
  'PRELIMINARY_ROUND',
  'FIRST_QUALIFYING_ROUND',
  'SECOND_QUALIFYING_ROUND',
  'THIRD_QUALIFYING_ROUND',
  'PLAY_OFFS',
  'PLAY_OFF_ROUND',
  'LAST_64',
  'ROUND_OF_32',
  'LAST_32',
  'ROUND_OF_16',
  'LAST_64',
  'LAST_32',
  'LAST_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
])

export function isKnockoutStage(stage: string | null | undefined): boolean {
  return !!stage && KNOCKOUT_STAGES.has(stage)
}
