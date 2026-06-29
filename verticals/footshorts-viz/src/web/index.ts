export { MatchRow } from './MatchRow'
export { MatchTile } from './MatchTile'
export { MatchTimeline } from './MatchTimeline'
export type { EventTypeFilter } from '../types'
export { MatchCard } from './MatchCard'
export type { MatchCardConfig, MatchCardLayout } from '../modules/match-card'
export { StandingsTable } from './StandingsTable'
export { StandingsOverMatchdays } from './StandingsOverMatchdays'
export { EntityChip } from './EntityChip'
export { EntityCard } from './EntityCard'
export { Bracket, TieCard } from './Bracket'
export { BracketTree } from './BracketTree'
export { TeamFormStrip } from './TeamFormStrip'
export { FsFrame } from './FsFrame'
export type { FsBackgroundConfig } from '../modules/shared/background'
export { Crest } from '../data/Crest'
export { buildBracket, isBracketDrawn } from '../buildBracket'
export { buildStaticBracket } from '../buildStaticBracket'
export { advanceBracket } from '../advanceBracket'
export type {
  StaticBracketInput,
  StaticRoundInput,
  StaticTieInput,
  StaticSlotInput,
} from '../buildStaticBracket'
// NB: the bracket *model* types (Bracket, BracketSlot, …) are re-exported from
// '@vismay/footshorts-viz/types', not here — `Bracket` is already a component
// value export above, so re-exporting the type would collide.
export { groupFixturesByRound } from '../scheduleRounds'
export type { ScheduleRound } from '../scheduleRounds'
export { stageLabel, stageRank, isKnockoutStage } from '../stageLabel'
export {
  getCompetitionDisplayName,
  getCompetitionPalette,
  resolveCompetitionColor,
  darkenHex,
  isLeagueCompetition,
  competitionFollowLabel,
} from '../competitionMeta'
