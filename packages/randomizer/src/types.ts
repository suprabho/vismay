/**
 * Types for the story randomizers: the three Vizmaya ones (the playbook's
 * Desk, Atlas and Epics), the Footshorts one (teams, tournaments and their
 * news) and the VizNBA one (franchises, conferences and their news), their
 * datasets (./data/*.json) and the spins they produce.
 *
 * Pure: no Supabase / Node imports, so admin client components can use them.
 */

export type RandomizerId = 'desk' | 'atlas' | 'epics' | 'footshorts' | 'viznba'

export const RANDOMIZERS: readonly RandomizerId[] = ['desk', 'atlas', 'epics', 'footshorts', 'viznba']

export function isRandomizerId(value: unknown): value is RandomizerId {
  return typeof value === 'string' && (RANDOMIZERS as readonly string[]).includes(value)
}

/** The site a randomizer's stories are hosted on (an @vismay/html-stories app slug). */
export type RandomizerApp = 'vizmaya-fyi' | 'footshorts' | 'viznba'

/** The randomizers one site's slot machine shows, in tab order. */
export function randomizersFor(app: RandomizerApp): RandomizerId[] {
  return RANDOMIZERS.filter((r) => RANDOMIZER_META[r].app === app)
}

export interface ReelDef {
  key: string
  label: string
  /** Locking this reel also locks these (a sub-industry only makes sense inside its industry). */
  parents?: string[]
  /** Shown only when an option is on (the Atlas pair reel, the Footshorts and NBA opponents). Never lockable. */
  option?: 'pair'
}

export interface RandomizerMeta {
  id: RandomizerId
  /** The site its stories go to; a spin's brief and publish only work there. */
  app: RandomizerApp
  name: string
  /** One line under the name: what it covers and its output format. */
  hint: string
  format: string
  reels: ReelDef[]
  /** The per-randomizer toggle: Atlas pair spin, Epics sequence mode, Footshorts and NBA head-to-head. */
  option: { key: 'pair' | 'sequence'; label: string } | null
  /**
   * Whether the hero insight waits for a human before anything public is
   * built from it (decision D4: gated for Atlas and Epics because of the
   * sensitivity rules, optional for the Desk, Footshorts and the NBA Desk).
   */
  gated: boolean
}

export const RANDOMIZER_META: Record<RandomizerId, RandomizerMeta> = {
  desk: {
    id: 'desk',
    app: 'vizmaya-fyi',
    name: 'Vizmaya Desk',
    hint: 'Industry · editorial',
    format: 'Editorial brief with charts',
    reels: [
      { key: 'industry', label: 'Industry' },
      { key: 'sub', label: 'Sub-industry', parents: ['industry'] },
      { key: 'lens', label: 'Lens' },
      { key: 'fresh', label: 'Freshness' },
    ],
    option: null,
    gated: false,
  },
  atlas: {
    id: 'atlas',
    app: 'vizmaya-fyi',
    name: 'Atlas',
    hint: 'Countries · geography',
    format: 'Geography format (route table)',
    reels: [
      { key: 'country', label: 'Country' },
      { key: 'thread', label: 'Cultural thread' },
      { key: 'time', label: 'Time depth' },
      { key: 'frame', label: 'Geography frame' },
      { key: 'lens', label: 'Lens' },
      { key: 'pair', label: 'Pair country', option: 'pair' },
    ],
    option: { key: 'pair', label: 'Pair spin (second country)' },
    gated: true,
  },
  epics: {
    id: 'epics',
    app: 'vizmaya-fyi',
    name: 'Epics',
    hint: 'Epics · geography',
    format: 'Geography format, epic variant',
    reels: [
      { key: 'epic', label: 'Epic' },
      { key: 'episode', label: 'Book, canto or episode', parents: ['epic'] },
      { key: 'place', label: 'Place', parents: ['episode', 'epic'] },
      { key: 'lens', label: 'Lens' },
    ],
    option: { key: 'sequence', label: 'Sequence mode (continue the route)' },
    gated: true,
  },
  footshorts: {
    id: 'footshorts',
    app: 'footshorts',
    name: 'Football Desk',
    hint: 'Teams · tournaments · news',
    format: 'Football explainer with charts',
    reels: [
      { key: 'competition', label: 'Tournament' },
      { key: 'team', label: 'Team', parents: ['competition'] },
      { key: 'angle', label: 'Angle' },
      { key: 'fresh', label: 'Freshness' },
      { key: 'pair', label: 'Opponent', option: 'pair' },
    ],
    option: { key: 'pair', label: 'Head-to-head (draw an opponent)' },
    gated: false,
  },
  viznba: {
    id: 'viznba',
    app: 'viznba',
    name: 'NBA Desk',
    hint: 'Franchises · conferences · news',
    format: 'Basketball explainer with charts',
    reels: [
      { key: 'conference', label: 'Conference' },
      { key: 'team', label: 'Team', parents: ['conference'] },
      { key: 'angle', label: 'Angle' },
      { key: 'fresh', label: 'Freshness' },
      { key: 'pair', label: 'Opponent', option: 'pair' },
    ],
    option: { key: 'pair', label: 'Head-to-head (draw an opponent)' },
    gated: false,
  },
}

/* ---------- Desk ---------- */

export interface DeskHeadline {
  title: string
  url: string
  /** ISO date, YYYY-MM-DD. */
  date: string
}

export interface DeskIndustry {
  id: string
  name: string
}

export interface DeskSubIndustry {
  id: string
  /** DeskIndustry.id */
  industry: string
  name: string
  /** 0 to 100. The dataset value is a seed; desk_heat overrides it once refreshed. */
  heat: number
  /** ISO timestamp of the last refresh; null when the seed was never refreshed. */
  heat_updated: string | null
  top_headlines: DeskHeadline[]
  /** The 3 to 5 numbers worth charting for this segment. */
  key_metrics: string[]
  /** Regulators, filings, trade bodies. */
  primary_sources: string[]
}

export interface NamedOption {
  name: string
  description: string
}

export interface DeskFreshness {
  name: 'Breaking' | 'Developing' | 'Evergreen'
  /** The news window in days; null for Evergreen. */
  days: number | null
  window: string
}

export interface DeskDataset {
  industries: DeskIndustry[]
  sub_industries: DeskSubIndustry[]
  lenses: NamedOption[]
  freshness: DeskFreshness[]
}

/** A desk_heat row (migration 088): the live heat for one sub-industry. */
export interface DeskHeatRow {
  subId: string
  heat: number
  heatUpdated: string | null
  topHeadlines: DeskHeadline[]
  /** 'failed' when the last refresh attempt failed; the UI must show it. */
  refreshStatus: 'ok' | 'failed'
  refreshError: string | null
  refreshedBy: string | null
}

/* ---------- Atlas ---------- */

export type PopulationBand = '<1M' | '1-10M' | '10-50M' | '50-100M' | '100M+'

export interface AtlasCountry {
  /** ISO 3166-1 alpha-2, lowercase (the flag-icons code). Kosovo uses xk. */
  iso: string
  name: string
  region: string
  subregion: string
  population_band: PopulationBand
  coastline: boolean
  /** On the extras list (observer, de facto state, territory), not a UN member. */
  extra?: boolean
  /** For extras: what kind, e.g. "UN observer state", "Territory of Denmark". */
  status?: string
  /** Optional curation, filled as research accumulates. */
  colonial_or_imperial_history?: string[]
  languages?: string[]
  major_faiths?: string[]
}

export interface AtlasDataset {
  regions: string[]
  countries: AtlasCountry[]
  threads: string[]
  time_depths: NamedOption[]
  frames: NamedOption[]
  lenses: NamedOption[]
}

/* ---------- Epics ---------- */

export type EpicType =
  | 'Heroic and war'
  | 'Voyage and return'
  | 'Philosophical and spiritual'
  | 'Foundational and creation'
  | 'Moral and social'

/** The playbook's geography status (3.4), mandatory on every place. */
export type GeoStatus = 'Verified' | 'Claimed' | 'Symbolic' | 'Lost'

export const GEO_STATUSES: readonly GeoStatus[] = ['Verified', 'Claimed', 'Symbolic', 'Lost']

export const GEO_STATUS_TEXT: Record<GeoStatus, string> = {
  Verified: 'Archaeology or documentary evidence supports the identification.',
  Claimed: 'A community, state or tourism body promotes the identification, without strong external evidence.',
  Symbolic: 'Scholarship holds that the place is not meant as literal geography.',
  Lost: 'Once identified, now unlocatable.',
}

export interface EpicPlace {
  id: string
  name: string
  /** Modern identification, in words ("Hisarlik, Çanakkale, Türkiye"). */
  modern: string
  /** ISO alpha-2 of the modern country, when there is one. */
  country?: string
  /** Line, verse or canto reference, when known. */
  text_ref?: string
  /** A starting point: research verifies it. */
  status: GeoStatus
}

export interface EpicEpisode {
  id: string
  name: string
  places: EpicPlace[]
}

export interface Epic {
  id: string
  title: string
  tradition: string
  types: EpicType[]
  approx_date_of_composition: string
  language: string
  /** Books, cantos, parvas: how the text divides itself. */
  structure: string
  /** For texts that sit inside another (the Gita inside the Mahabharata). */
  part_of?: string
  /** The status most of its places carry, said up front because it frames the story. */
  geography_status: { dominant: GeoStatus; note: string }
  best_editions_and_translations: string[]
  key_scholarly_sources: string[]
  episodes: EpicEpisode[]
}

export interface EpicsDataset {
  traditions: string[]
  epics: Epic[]
  lenses: NamedOption[]
}

/* ---------- Footshorts ---------- */

export type FootshortsCompetitionKind = 'domestic' | 'continental' | 'international'

export interface FootshortsCompetition {
  /** fixtures.competition_slug, the key the draw and the match tables use. */
  slug: string
  name: string
  kind: FootshortsCompetitionKind
  /** Country, or Europe / World for the continental and international ones. */
  country: string
  /** The league entity's slug(s) in `entities`, for its tagged news (the World Cup has two in the wild). */
  entity_slugs: string[]
}

export interface FootshortsFreshness {
  name: 'Matchday' | 'Running story' | 'Evergreen'
  /** The news window in days; null for Evergreen. */
  days: number | null
  window: string
}

export interface FootshortsDataset {
  competitions: FootshortsCompetition[]
  angles: NamedOption[]
  freshness: FootshortsFreshness[]
}

/** A tagged footshorts article, as the news snapshot keeps it. */
export interface FootshortsHeadline {
  title: string
  url: string
  publisher: string
  /** ISO date, YYYY-MM-DD. */
  date: string
}

/** One fixture a team played or will play, as the spin snapshots it. */
export interface FootshortsFixtureRef {
  /** fixtures.id: the brief appends its match context. */
  id: string
  competition: string
  kickoff: string
  /** football-data.org status: FINISHED, SCHEDULED, TIMED, IN_PLAY, POSTPONED… */
  status: string
  homeId: string | null
  awayId: string | null
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
}

/**
 * One team in the live news snapshot (spins.ts loadFootshortsNews): its
 * entity, the competitions it has fixtures in, and its news heat.
 */
export interface FootshortsTeamNews {
  /** entities.id */
  id: string
  /** entities.slug */
  slug: string
  name: string
  country: string | null
  crestUrl: string | null
  /** Competition slugs (dataset keys) the team has fixtures in, in the window. */
  competitions: string[]
  /** 0 to 100, relative to the busiest team in the snapshot. */
  heat: number
  /** Distinct stories (cluster leads) tagged with the team in the news window. */
  articles: number
  /** Newest first, up to 3. */
  headlines: FootshortsHeadline[]
  /** The last finished fixtures (newest first) and the next ones (soonest first), across competitions. */
  recent: FootshortsFixtureRef[]
  upcoming: FootshortsFixtureRef[]
}

export interface FootshortsCompetitionNews {
  slug: string
  /** 0 to 100, relative to the busiest competition. */
  heat: number
  /** Distinct stories tagged with the competition or any of its teams. */
  articles: number
  headlines: FootshortsHeadline[]
  /** Teams with fixtures in it, in the window. */
  teams: number
}

/** The live news the Footshorts draw reads (the Desk's heat, computed from the footshorts feed). */
export interface FootshortsNews {
  /** ISO timestamp the snapshot was read. */
  asOf: string
  /** The news window heat is counted over, in days. */
  windowDays: number
  competitions: FootshortsCompetitionNews[]
  teams: FootshortsTeamNews[]
}

/* ---------- VizNBA ---------- */

export type ViznbaConferenceSlug = 'east' | 'west'

export interface ViznbaConference {
  slug: ViznbaConferenceSlug
  name: string
  divisions: string[]
}

/** One franchise as the dataset fixes it (viznba_teams carries the rest). */
export interface ViznbaTeam {
  /** viznba_teams.team_id: ESPN's abbreviation lowercased ("lal", "gs", "utah"). */
  id: string
  /** ESPN team id: scoreboards and game summaries key on it. */
  espn_id: string
  /** The NBA abbreviation ("GSW"), as the league writes it. */
  abbreviation: string
  name: string
  conference: ViznbaConferenceSlug
  division: string
  /** Team colour, hex. */
  color: string
}

export interface ViznbaFreshness {
  name: 'Last night' | 'This week' | 'Evergreen'
  /** The news window in days; null for Evergreen. */
  days: number | null
  window: string
}

export interface ViznbaDataset {
  conferences: ViznbaConference[]
  teams: ViznbaTeam[]
  angles: NamedOption[]
  freshness: ViznbaFreshness[]
}

/** A tagged VizNBA article, as the news snapshot keeps it. */
export interface ViznbaHeadline {
  title: string
  url: string
  publisher: string
  /** ISO date, YYYY-MM-DD. */
  date: string
  /** The worker's topic: game, transaction, injury, draft, front_office, league, analysis, off_court. */
  topic: string | null
}

/** One game a team played or will play, from ESPN's scoreboard. */
export interface ViznbaGameRef {
  /** ESPN event id: the brief appends that game's box score. */
  id: string
  /** ISO timestamp of the tip-off. */
  date: string
  /** ESPN's state: pre, in or post. */
  state: 'pre' | 'in' | 'post'
  /** Preseason, Regular Season, Play-In, Postseason… as ESPN labels it. */
  season: string | null
  homeId: string | null
  awayId: string | null
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
}

/** A player or coach whose stories put the team in the news. */
export interface ViznbaPersonNews {
  id: string
  name: string
  kind: 'player' | 'coach'
  articles: number
}

/** One franchise in the live news snapshot (spins.ts loadViznbaNews). */
export interface ViznbaTeamNews {
  /** viznba_teams.team_id */
  id: string
  espnId: string
  abbreviation: string
  name: string
  conference: ViznbaConferenceSlug
  division: string
  logoUrl: string | null
  color: string
  /** 0 to 100, relative to the busiest franchise in the snapshot. */
  heat: number
  /** Distinct stories tagged with the team, or a player or coach on it, in the news window. */
  articles: number
  /** Newest first, up to 3. */
  headlines: ViznbaHeadline[]
  /** The most-tagged people on the roster, up to 3. */
  people: ViznbaPersonNews[]
  /** The last finished games (newest first) and the next ones (soonest first). */
  recent: ViznbaGameRef[]
  upcoming: ViznbaGameRef[]
}

export interface ViznbaConferenceNews {
  slug: ViznbaConferenceSlug
  /** 0 to 100, relative to the busier conference. */
  heat: number
  /** Distinct stories tagged with any of its teams. */
  articles: number
  headlines: ViznbaHeadline[]
}

/** The live news the NBA Desk draws from, read from the viznba_ tables and ESPN's scoreboard. */
export interface ViznbaNews {
  /** ISO timestamp the snapshot was read. */
  asOf: string
  /** The news window heat is counted over, in days. */
  windowDays: number
  conferences: ViznbaConferenceNews[]
  teams: ViznbaTeamNews[]
  /** The schedule read from ESPN; when it failed, the draw runs on the news alone and says so. */
  schedule: { ok: boolean; games: number; error: string | null }
}

/* ---------- Spins ---------- */

export type RuleKind = 'block' | 'warn' | 'good' | 'info'

/** One rule that fired during a draw, shown in admin and kept in the log. */
export interface RuleFired {
  tag: string
  kind: RuleKind
  text: string
}

export interface ReelValue {
  value: string
  sub?: string
  /** A GeoStatus for the Epics place reel. */
  badge?: GeoStatus
}

export interface DeskPicks {
  subId: string
  lens: string
  /** The freshness the spin ended on, after the fallback. */
  fresh: DeskFreshness['name']
  /** The freshness the reel drew, before the fallback. */
  freshDrawn: DeskFreshness['name']
}

export interface AtlasPicks {
  iso: string
  thread: string
  time: string
  frame: string
  lens: string
  pairIso?: string
}

export interface EpicsPicks {
  epicId: string
  episodeId: string
  placeId: string
  lens: string
}

export interface ViznbaPicks {
  conference: ViznbaConferenceSlug
  /** viznba_teams.team_id */
  team: string
  angle: string
  fresh: ViznbaFreshness['name']
  freshDrawn: ViznbaFreshness['name']
  /** viznba_teams.team_id of the head-to-head opponent. */
  opponent?: string
}

export interface FootshortsPicks {
  competition: string
  /** entities.slug of the team. */
  team: string
  angle: string
  fresh: FootshortsFreshness['name']
  freshDrawn: FootshortsFreshness['name']
  /** entities.slug of the head-to-head opponent. */
  opponent?: string
}

/**
 * What the draw saw, frozen into the spin so the brief and the research stub
 * read the same thing later even if the dataset changes.
 */
export interface DeskSubject {
  randomizer: 'desk'
  industry: DeskIndustry
  sub: DeskSubIndustry
  lens: NamedOption
  freshness: DeskFreshness
  /** The heat score is older than the staleness window (or was never refreshed). */
  heatStale: boolean
  /** The last refresh failed: the spin was forced to Evergreen. */
  refreshFailed: boolean
  /** Days since the newest known development, or null when none is on file. */
  lastDevelopmentDays: number | null
}

export interface AtlasSubject {
  randomizer: 'atlas'
  country: AtlasCountry
  pair: AtlasCountry | null
  thread: string
  time: NamedOption
  frame: NamedOption
  lens: NamedOption
}

export interface EpicsSubject {
  randomizer: 'epics'
  epic: Omit<Epic, 'episodes'> & { place_count: number }
  episode: Omit<EpicEpisode, 'places'> & { places: EpicPlace[] }
  place: EpicPlace
  lens: NamedOption
  /** Continued from the previous spin's place (sequence mode). */
  sequence: boolean
}

export interface FootshortsSubject {
  randomizer: 'footshorts'
  competition: FootshortsCompetition & { heat: number; articles: number }
  team: FootshortsTeamNews
  opponent: FootshortsTeamNews | null
  angle: NamedOption
  freshness: FootshortsFreshness
  /** Days since the team's newest tagged story, or null when none is on file. */
  lastDevelopmentDays: number | null
  /** When the news snapshot was read, and its window. */
  newsAsOf: string
  newsWindowDays: number
  /**
   * The fixtures the brief appends match context for: the team's (or the
   * head-to-head's) recent results and next match, ids from `fixtures`.
   */
  fixtureIds: string[]
}

export interface ViznbaSubject {
  randomizer: 'viznba'
  conference: ViznbaConference & { heat: number; articles: number }
  team: ViznbaTeamNews
  opponent: ViznbaTeamNews | null
  angle: NamedOption
  freshness: ViznbaFreshness
  /** Days since the team's newest tagged story, or null when none is on file. */
  lastDevelopmentDays: number | null
  /** When the news snapshot was read, and its window. */
  newsAsOf: string
  newsWindowDays: number
  /**
   * The games the brief appends box scores for: the team's (or the
   * head-to-head's) recent results and next game, ESPN event ids.
   */
  gameIds: string[]
}

export type SpinSubject = DeskSubject | AtlasSubject | EpicsSubject | FootshortsSubject | ViznbaSubject
export type SpinPicks = DeskPicks | AtlasPicks | EpicsPicks | FootshortsPicks | ViznbaPicks

/** Balancing memory the next draw reads back. */
export interface SpinMeta {
  region?: string
  /** Footshorts: the competition slug, for the same-tournament-twice rule. */
  competition?: string
  /** NBA Desk: the conference, for the same-conference-twice rule. */
  conference?: string
  pair?: boolean
  tradition?: string
  types?: EpicType[]
  heat?: number
}

export interface DrawResult {
  randomizer: RandomizerId
  picks: SpinPicks
  subject: SpinSubject
  reels: Record<string, ReelValue>
  /** The single primary reel value the 30-day block keys on (sub-industry, country, epic, team). */
  primary: string
  /** The full combination the 90-day block keys on. */
  combo: string
  summary: string
  rules: RuleFired[]
  meta: SpinMeta
}

export type SpinStatus = 'spun' | 'rejected' | 'researching' | 'insight_review' | 'approved' | 'published'

export const SPIN_STATUSES: readonly SpinStatus[] = [
  'spun',
  'rejected',
  'researching',
  'insight_review',
  'approved',
  'published',
]

/** One-tap reasons for a re-spin (decision D6), so the weights can be tuned later. */
export const RESPIN_REASONS = ['boring', 'too recent', 'no data', 'too sensitive', 'other'] as const
export type RespinReason = (typeof RESPIN_REASONS)[number]

export interface SpinOptions {
  locks: string[]
  pair?: boolean
  sequence?: boolean
}

/** A logged spin (randomizer_spins). */
export interface SpinRecord extends DrawResult {
  id: string
  /** The rng seed, 8 hex digits. Same seed, same history, same draw. */
  seed: string
  status: SpinStatus
  rejectedReason: string | null
  /** The spin this one replaced with a re-spin. */
  respinOf: string | null
  options: SpinOptions
  researchMd: string | null
  heroInsight: string | null
  /** What a reviewer said when sending the insight back. */
  reviewNote: string | null
  storySlug: string | null
  /** 'admin', 'mcp', 'api'. */
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** The slice of a past spin the draw needs. */
export interface SpinHistoryEntry {
  id?: string
  status: SpinStatus
  primary: string
  combo: string
  meta: SpinMeta
  picks: SpinPicks
  createdAt: string
}
